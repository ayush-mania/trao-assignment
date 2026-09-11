// Best-first crawl of a company site: fetch the homepage, rank its links, keep fetching the most
// promising unvisited page until we have both an about and a hiring page or hit the caps.
// Every skipped or failed page is recorded — a missing hiring page is a finding, not a failure.
import { cleanPage, type CleanedPage } from './clean-page.js';
import { fetchPage, type FetchFailure, type FetchOptions } from './fetch-page.js';
import { classifyPage, rankLinks, type PageKind } from './rank-links.js';

export interface CrawlOptions extends Omit<FetchOptions, 'robotsCache'> {
  maxPages?: number;
  /** Wall-clock budget for the whole crawl. */
  maxMs?: number;
  /** Pause between requests (politeness; Section 2 asks us to rate-limit). */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface CrawledPage extends CleanedPage {
  kind: PageKind;
  score: number;
}

export interface SkippedPage {
  url: string;
  reason: FetchFailure | 'budget_exhausted';
}

export interface CrawlResult {
  /** The homepage as fetched, or null when the site is unreachable. */
  homepage: CrawledPage | null;
  pages: CrawledPage[];
  skipped: SkippedPage[];
  /** Why the crawl stopped. */
  stoppedBecause: 'unreachable' | 'found_both' | 'no_more_links' | 'max_pages' | 'max_time';
}

export async function crawlSite(startUrl: string, opts: CrawlOptions): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 12;
  const maxMs = opts.maxMs ?? 60_000;
  const delayMs = opts.delayMs ?? 250;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const fetchOpts: FetchOptions = { ...opts, robotsCache: new Map() };

  const pages: CrawledPage[] = [];
  const skipped: SkippedPage[] = [];
  const visited = new Set<string>();

  const home = await fetchOne(startUrl);
  if (!home) return { homepage: null, pages, skipped, stoppedBecause: 'unreachable' };
  const origin = new URL(home.url).origin;

  const queue = new Map<string, number>(); // href -> best score seen
  const enqueue = (page: CleanedPage) => {
    for (const l of rankLinks(page.links, origin)) {
      const key = normaliseKey(l.href);
      if (visited.has(key)) continue;
      if ((queue.get(l.href) ?? -Infinity) < l.score) queue.set(l.href, l.score);
    }
  };
  enqueue(home);

  let stoppedBecause: CrawlResult['stoppedBecause'] = 'no_more_links';
  while (queue.size > 0) {
    if (have('about') && have('hiring')) {
      stoppedBecause = 'found_both';
      break;
    }
    if (pages.length >= maxPages) {
      stoppedBecause = 'max_pages';
      break;
    }
    if (now() - started > maxMs) {
      stoppedBecause = 'max_time';
      break;
    }
    const [href] = [...queue.entries()].sort((a, b) => b[1] - a[1])[0]!;
    queue.delete(href);
    if (visited.has(normaliseKey(href))) continue;
    await sleep(delayMs);
    const page = await fetchOne(href);
    if (page) enqueue(page);
  }
  if (queue.size === 0 && stoppedBecause === 'no_more_links' && have('about') && have('hiring')) {
    stoppedBecause = 'found_both';
  }
  for (const href of queue.keys()) skipped.push({ url: href, reason: 'budget_exhausted' });
  return { homepage: home, pages, skipped, stoppedBecause };

  function have(kind: PageKind): boolean {
    return pages.some((p) => p.kind === kind);
  }

  async function fetchOne(href: string): Promise<CrawledPage | null> {
    visited.add(normaliseKey(href));
    const r = await fetchPage(href, fetchOpts);
    if (!r.ok) {
      skipped.push({ url: href, reason: r.reason });
      return null;
    }
    visited.add(normaliseKey(r.page.finalUrl));
    const cleaned = cleanPage(r.page.finalUrl, r.page.body, r.page.contentType);
    const page: CrawledPage = {
      ...cleaned,
      kind: classifyPage(cleaned.title, cleaned.text, cleaned.url),
      score: 0,
    };
    pages.push(page);
    return page;
  }
}

function normaliseKey(href: string): string {
  try {
    const u = new URL(href);
    u.hash = '';
    return u.href.replace(/\/(index\.html?)?$/, '').toLowerCase();
  } catch {
    return href;
  }
}
