// What retrieval found, in the shape generation steps consume. Built by the pipeline from
// crawlSite() and searchPublicDiscussion() results; generation never touches the network.
import type { CrawledPage } from '../retrieval/crawl-site.js';
import type { DiscussionSnippet } from '../retrieval/public-discussion.js';

export interface ResearchContext {
  companyName: string;
  companyUrl: string;
  homepage: CrawledPage | null;
  aboutPage: CrawledPage | null;
  hiringPage: CrawledPage | null;
  discussion: DiscussionSnippet[];
  /** Human-readable reasons research came up short (unreachable site, no hiring page, ...). */
  gaps: string[];
}

export function hasAnyResearch(ctx: ResearchContext): boolean {
  return Boolean(ctx.homepage || ctx.aboutPage || ctx.hiringPage || ctx.discussion.length > 0);
}

/** URLs actually used as evidence, deduplicated, in a stable order. */
export function researchSources(ctx: ResearchContext): string[] {
  const urls = [
    ctx.aboutPage?.url,
    ctx.hiringPage?.url,
    ctx.homepage?.url,
    ...ctx.discussion.map((d) => d.url),
  ];
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/** Signals from the hiring page and discussion that change which question categories matter. */
export interface HiringSignals {
  takeHome: boolean;
  systemDesign: boolean;
  behavioural: boolean;
  pairProgramming: boolean;
  algorithms: boolean;
  /** True when we have any evidence about the process at all. */
  known: boolean;
}

export function hiringSignals(ctx: ResearchContext): HiringSignals {
  const text = [ctx.hiringPage?.text ?? '', ...ctx.discussion.map((d) => `${d.title} ${d.text}`)]
    .join('\n')
    .toLowerCase();
  // "We do not do whiteboard puzzles" must not read as a whiteboard signal: drop negated sentences.
  const positive = text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(
      (sentence) => !/\b(no|not|don'?t|never|without|rather than|instead of)\b/.test(sentence),
    )
    .join('\n');
  const has = (re: RegExp) => re.test(positive);
  return {
    takeHome: has(/take[- ]home|homework|assignment/),
    systemDesign: has(/system design|architecture (?:interview|round)|design (?:interview|round)/),
    behavioural: has(/behaviou?ral|culture (?:fit|interview)|values interview|hiring manager/),
    pairProgramming: has(/pair[- ]programming|live coding|pairing/),
    algorithms: has(/leetcode|algorithm|whiteboard|data structures/),
    known: text.trim().length > 0,
  };
}

/**
 * Company name for searches and the kit: the JD's statement first, else the site's own title
 * ("Acme Robotics" from "Company - Acme Robotics"), never a bare hostname — searching
 * "localhost interview" once returned unrelated Hacker News threads that then poisoned a brief.
 */
export function resolveCompanyName(fromJd: string, pages: { title: string }[]): string {
  const jd = fromJd.trim();
  if (jd && !looksLikeHost(jd)) return jd;
  for (const page of pages) {
    const name = nameFromTitle(page.title);
    if (name) return name;
  }
  return '';
}

const GENERIC_TITLE =
  /^(home|homepage|welcome|about|about us|company|careers|jobs|team|contact|blog|index)$/i;

export function nameFromTitle(title: string): string {
  const parts = title
    .split(/\s+[-|—–:·]\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !GENERIC_TITLE.test(p));
  const candidate = parts.length > 1 ? parts[parts.length - 1]! : (parts[0] ?? '');
  return candidate.length >= 2 && candidate.length <= 60 && !looksLikeHost(candidate)
    ? candidate
    : '';
}

export function looksLikeHost(s: string): boolean {
  return /^(localhost|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?$/i.test(s.trim());
}
