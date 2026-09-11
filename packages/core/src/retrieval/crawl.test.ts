import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crawlSite } from './crawl-site.js';
import { classifyPage, rankLinks } from './rank-links.js';

// Serves fixtures/sites exactly like scripts/serve-fixtures.ts, but in-process.
const root = join(process.cwd(), '..', '..', 'fixtures', 'sites');
const fixtureFetch = (async (input: string | URL) => {
  const u = new URL(typeof input === 'string' ? input : input.href);
  const p = u.pathname;
  const candidates = p.endsWith('/')
    ? [`${p}index.html`, `${p.slice(0, -1)}.html`]
    : [p, `${p}.html`, `${p}/index.html`];
  for (const c of candidates) {
    try {
      const body = await readFile(join(root, c), 'utf8');
      const type = c.endsWith('.txt') ? 'text/plain' : 'text/html';
      return new Response(body, { status: 200, headers: { 'content-type': type } });
    } catch {
      /* next */
    }
  }
  return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
}) as typeof fetch;

const opts = {
  policy: { allowPrivate: true },
  fetchImpl: fixtureFetch,
  delayMs: 0,
};

describe('rankLinks', () => {
  const origin = 'https://acme.example';
  it('puts hiring and about links first and drops noise and off-site links', () => {
    const ranked = rankLinks(
      [
        { href: 'https://acme.example/pricing', text: 'Pricing' },
        {
          href: 'https://acme.example/company/handbook/how-we-interview',
          text: 'How we interview',
        },
        { href: 'https://acme.example/about', text: 'About us' },
        { href: 'https://acme.example/products', text: 'Products' },
        { href: 'https://other.example/careers', text: 'Careers' },
        { href: 'https://acme.example/login', text: 'Login' },
      ],
      origin,
    );
    expect(ranked.map((l) => l.href)).toEqual([
      'https://acme.example/company/handbook/how-we-interview',
      'https://acme.example/about',
      'https://acme.example/products',
    ]);
  });
});

describe('classifyPage', () => {
  it('detects a hiring page from content, an about page, and other', () => {
    expect(
      classifyPage('Join us', 'Our interview process has a take-home and a system design round.'),
    ).toBe('hiring');
    expect(
      classifyPage('Company', 'What we do: we build robots. Founded in 2016, our team of 40.'),
    ).toBe('about');
    expect(classifyPage('Pricing', 'Plans start at 10 per month.')).toBe('other');
  });
});

describe('crawlSite on fixture sites', () => {
  it('finds the buried hiring page on acme without a hard-coded path', async () => {
    const r = await crawlSite('http://localhost:8099/acme/', opts);
    const hiring = r.pages.find((p) => p.kind === 'hiring');
    expect(hiring?.url).toBe('http://localhost:8099/acme/company/handbook/how-we-interview');
    expect(hiring?.text).toContain('take-home');
    expect(r.pages.some((p) => p.kind === 'about')).toBe(true);
    expect(r.stoppedBecause).toBe('found_both');
    // login is disallowed by robots.txt and never fetched; noise links are never queued
    expect(r.pages.map((p) => p.url)).not.toContain('http://localhost:8099/acme/login');
    expect(r.pages.length).toBeLessThanOrEqual(6);
  });

  it('reports honestly when a site has no hiring page anywhere', async () => {
    const r = await crawlSite('http://localhost:8099/nohire/', { ...opts, maxPages: 10 });
    expect(r.pages.some((p) => p.kind === 'hiring')).toBe(false);
    expect(r.pages.some((p) => p.kind === 'about')).toBe(true);
    expect(r.stoppedBecause).toBe('no_more_links');
  });

  it('returns unreachable for a dead host with the reason recorded', async () => {
    const dead = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await crawlSite('http://localhost:1/none/', { ...opts, fetchImpl: dead });
    expect(r.homepage).toBeNull();
    expect(r.stoppedBecause).toBe('unreachable');
    expect(r.skipped[0]).toMatchObject({ reason: 'network_error' });
  });

  it('stops at maxPages and lists what it did not get to', async () => {
    const r = await crawlSite('http://localhost:8099/acme/', { ...opts, maxPages: 2 });
    expect(r.pages.length).toBe(2);
    expect(r.stoppedBecause).toBe('max_pages');
    expect(r.skipped.some((s) => s.reason === 'budget_exhausted')).toBe(true);
  });
});
