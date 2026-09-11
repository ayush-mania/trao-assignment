// Fetch one page with the guard rails from Sections 2 and 11: URL policy, robots.txt, timeout,
// redirect cap, content-type and size caps. Never throws for a bad page: every failure is a reason.
import robotsParserModule from 'robots-parser';

// The package's ambient typing collides with its default export under NodeNext; pin the shape we use.
const robotsParser = robotsParserModule as unknown as (url: string, txt: string) => RobotsRules;
import { checkUrl, type UrlPolicy, type UrlRejection } from './url-policy.js';

export const USER_AGENT = 'TraoPrepKitBot/0.1 (+interview-prep research; respects robots.txt)';

export interface FetchOptions {
  policy: UrlPolicy;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Shared across a crawl so robots.txt is read once per origin. */
  robotsCache?: Map<string, RobotsRules | null>;
}

export type FetchFailure =
  | UrlRejection
  | 'blocked_by_robots'
  | 'timeout'
  | 'network_error'
  | 'too_many_redirects'
  | `http_${number}`
  | 'unsupported_content_type'
  | 'too_large';

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

export type FetchResult =
  { ok: true; page: FetchedPage } | { ok: false; url: string; reason: FetchFailure };

export type RobotsRules = { isAllowed(url: string, ua: string): boolean | undefined };

export async function fetchPage(input: string, opts: FetchOptions): Promise<FetchResult> {
  const checked = await checkUrl(input, opts.policy);
  if (!checked.ok) return { ok: false, url: input, reason: checked.reason };
  const url = checked.url;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  const robots = await loadRobots(url, fetchImpl, timeoutMs, opts.robotsCache);
  if (robots && robots.isAllowed(url.href, USER_AGENT) === false) {
    return { ok: false, url: url.href, reason: 'blocked_by_robots' };
  }

  // Manual redirect following so every hop is re-checked against the URL policy (no SSRF via 302).
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
    } catch (err) {
      const name = (err as Error)?.name;
      return {
        ok: false,
        url: url.href,
        reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error',
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { ok: false, url: url.href, reason: `http_${res.status}` };
      const next = await checkUrl(new URL(location, current).href, opts.policy);
      if (!next.ok) return { ok: false, url: url.href, reason: next.reason };
      current = next.url;
      continue;
    }
    if (res.status !== 200) return { ok: false, url: url.href, reason: `http_${res.status}` };

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!/^(text\/html|text\/plain|application\/xhtml\+xml)/.test(contentType)) {
      return { ok: false, url: url.href, reason: 'unsupported_content_type' };
    }
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, url: url.href, reason: 'too_large' };
    }
    const body = await readCapped(res, maxBytes);
    if (body === null) return { ok: false, url: url.href, reason: 'too_large' };
    return {
      ok: true,
      page: { url: url.href, finalUrl: current.href, status: res.status, contentType, body },
    };
  }
  return { ok: false, url: url.href, reason: 'too_many_redirects' };
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** robots.txt per origin; unreachable or malformed robots means "no restrictions". */
async function loadRobots(
  url: URL,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  cache?: Map<string, RobotsRules | null>,
): Promise<RobotsRules | null> {
  const origin = url.origin;
  if (cache?.has(origin)) return cache.get(origin) ?? null;
  let rules: RobotsRules | null = null;
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT },
    });
    if (res.status === 200) rules = robotsParser(`${origin}/robots.txt`, await res.text());
  } catch {
    rules = null;
  }
  cache?.set(origin, rules);
  return rules;
}
