import { describe, expect, it } from 'vitest';
import { cleanPage } from './clean-page.js';
import { fetchPage, type FetchOptions } from './fetch-page.js';
import { checkUrl, isPrivateAddress } from './url-policy.js';

type Route = { status?: number; headers?: Record<string, string>; body?: string; throw?: Error };

function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const r = routes[href];
    if (!r)
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (r.throw) throw r.throw;
    return new Response(r.body ?? '', {
      status: r.status ?? 200,
      headers: { 'content-type': 'text/html', ...(r.headers ?? {}) },
    });
  }) as typeof fetch;
}

const resolvePublic = async () => ['93.184.216.34'];
const resolvePrivate = async () => ['10.0.0.5'];
const prod = { allowPrivate: false, resolve: resolvePublic };

describe('checkUrl (SSRF policy)', () => {
  it.each([
    ['ftp://example.com', 'unsupported_scheme'],
    ['not a url', 'invalid_url'],
    ['http://localhost:8099/acme/', 'private_address'],
    ['http://127.0.0.1/', 'private_address'],
    ['http://[::1]/', 'private_address'],
    ['http://169.254.169.254/latest/meta-data', 'private_address'],
  ])('rejects %s in production', async (url, reason) => {
    expect(await checkUrl(url, prod)).toEqual({ ok: false, reason });
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    const r = await checkUrl('http://evil.example/', {
      allowPrivate: false,
      resolve: resolvePrivate,
    });
    expect(r).toEqual({ ok: false, reason: 'private_address' });
  });

  it('allows localhost when private targets are allowed (local batch run)', async () => {
    const r = await checkUrl('http://localhost:8099/acme/', { allowPrivate: true });
    expect(r.ok).toBe(true);
  });

  it('strips credentials and fragments', async () => {
    const r = await checkUrl('https://user:pw@example.com/a#frag', prod);
    expect(r.ok && r.url.href).toBe('https://example.com/a');
  });

  it('rejects hex v4-mapped IPv6 literals (how URL serialises ::ffff:a.b.c.d)', async () => {
    expect(await checkUrl('http://[::ffff:a9fe:a9fe]/latest/meta-data', prod)).toEqual({
      ok: false,
      reason: 'private_address',
    });
    expect(await checkUrl('http://[::ffff:7f00:1]/', prod)).toEqual({
      ok: false,
      reason: 'private_address',
    });
  });

  it('classifies private ranges', () => {
    expect(
      ['10.1.1.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::ffff:127.0.0.1', 'fd00::1'].every(
        isPrivateAddress,
      ),
    ).toBe(true);
    expect(['8.8.8.8', '172.32.0.1', '2606:4700::1'].some(isPrivateAddress)).toBe(false);
  });
});

describe('fetchPage', () => {
  const base: FetchOptions = { policy: { allowPrivate: false, resolve: resolvePublic } };

  it('returns the body of a 200 html page', async () => {
    const r = await fetchPage('https://acme.example/', {
      ...base,
      fetchImpl: fakeFetch({ 'https://acme.example/': { body: '<html><body>hi</body></html>' } }),
    });
    expect(r.ok && r.page.body).toContain('hi');
  });

  it('reports a 404 as a reason, not an exception', async () => {
    const r = await fetchPage('https://acme.example/missing', {
      ...base,
      fetchImpl: fakeFetch({}),
    });
    expect(r).toMatchObject({ ok: false, reason: 'http_404' });
  });

  it('honours robots.txt', async () => {
    const r = await fetchPage('https://acme.example/private/x', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/robots.txt': {
          body: 'User-agent: *\nDisallow: /private/',
          headers: { 'content-type': 'text/plain' },
        },
        'https://acme.example/private/x': { body: '<p>secret</p>' },
      }),
    });
    expect(r).toMatchObject({ ok: false, reason: 'blocked_by_robots' });
  });

  it('re-checks the policy on every redirect hop', async () => {
    const r = await fetchPage('https://acme.example/go', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/go': { status: 302, headers: { location: 'http://127.0.0.1/admin' } },
      }),
    });
    expect(r).toMatchObject({ ok: false, reason: 'private_address' });
  });

  it('follows a relative redirect and reports the final url', async () => {
    const r = await fetchPage('https://acme.example/old', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/old': { status: 301, headers: { location: '/new' } },
        'https://acme.example/new': { body: '<p>new</p>' },
      }),
    });
    expect(r.ok && r.page.finalUrl).toBe('https://acme.example/new');
  });

  it('rejects non-text content types and oversized bodies', async () => {
    const pdf = await fetchPage('https://acme.example/f.pdf', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/f.pdf': { body: 'x', headers: { 'content-type': 'application/pdf' } },
      }),
    });
    expect(pdf).toMatchObject({ ok: false, reason: 'unsupported_content_type' });
    const big = await fetchPage('https://acme.example/big', {
      ...base,
      maxBytes: 10,
      fetchImpl: fakeFetch({ 'https://acme.example/big': { body: 'x'.repeat(100) } }),
    });
    expect(big).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('returns a reason for a malformed redirect target', async () => {
    const r = await fetchPage('https://acme.example/go', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/go': { status: 302, headers: { location: 'http://' } },
      }),
    });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_url' });
  });

  it('returns a reason when the body stream fails mid-read', async () => {
    const stalled = () =>
      new ReadableStream<Uint8Array>({
        pull() {
          const e = new Error('aborted');
          e.name = 'TimeoutError';
          throw e;
        },
      });
    const impl = (async () =>
      new Response(stalled(), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    const r = await fetchPage('https://acme.example/stall', { ...base, fetchImpl: impl });
    expect(r).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('ignores a redirected robots.txt instead of following it', async () => {
    const r = await fetchPage('https://acme.example/', {
      ...base,
      fetchImpl: fakeFetch({
        'https://acme.example/robots.txt': {
          status: 302,
          headers: { location: 'http://127.0.0.1/' },
        },
        'https://acme.example/': { body: '<p>ok</p>' },
      }),
    });
    expect(r.ok).toBe(true);
  });

  it('maps timeouts and network errors to reasons', async () => {
    const t = new Error('timeout');
    t.name = 'TimeoutError';
    const r1 = await fetchPage('https://acme.example/slow', {
      ...base,
      fetchImpl: fakeFetch({ 'https://acme.example/slow': { throw: t } }),
    });
    expect(r1).toMatchObject({ ok: false, reason: 'timeout' });
    const r2 = await fetchPage('https://acme.example/down', {
      ...base,
      fetchImpl: fakeFetch({ 'https://acme.example/down': { throw: new Error('ECONNREFUSED') } }),
    });
    expect(r2).toMatchObject({ ok: false, reason: 'network_error' });
  });
});

describe('cleanPage', () => {
  const html = `<html><head><title> Acme — Home </title></head><body>
    <nav><a href="/careers">Careers</a></nav>
    <main><h1>We build widgets</h1><p>Since 1999.</p>
      <a href="about">About us</a> <a href="https://other.example/x#top">Partner</a>
      <a href="mailto:hi@acme.example">mail</a> <a href="#top">top</a>
      <script>alert(1)</script></main>
    <footer>© Acme</footer></body></html>`;

  it('extracts title, readable text, and resolved links', () => {
    const page = cleanPage('http://localhost:8099/acme/', html);
    expect(page.title).toBe('Acme — Home');
    expect(page.text).toContain('We build widgets\nSince 1999.');
    expect(page.text).not.toContain('alert');
    expect(page.text).not.toContain('© Acme');
    expect(page.links.map((l) => l.href)).toEqual([
      'http://localhost:8099/careers',
      'http://localhost:8099/acme/about',
      'https://other.example/x',
    ]);
    expect(page.links[0]!.text).toBe('Careers');
  });

  it('passes plain text through', () => {
    expect(cleanPage('u', 'a  b\n\n\n\nc', 'text/plain').text).toBe('a b\n\nc');
  });
});
