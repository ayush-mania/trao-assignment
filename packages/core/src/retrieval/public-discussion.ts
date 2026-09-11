// Public discussion of a company's interview process (Sections 2–3). Two key-less, free sources:
// Hacker News (Algolia search API) and Reddit (public JSON search). Glassdoor, Blind and LinkedIn
// block automated access and are not attempted. A failed source is recorded and skipped; no
// results is an honest outcome the brief wants reported, not filled in.
import { USER_AGENT } from './fetch-page.js';

export interface DiscussionSnippet {
  source: 'hackernews' | 'reddit';
  title: string;
  url: string;
  text: string;
  /** Unix seconds when available. */
  createdAt: number | null;
}

export interface DiscussionSkip {
  source: 'hackernews' | 'reddit';
  reason: string;
}

export interface DiscussionResult {
  query: string;
  snippets: DiscussionSnippet[];
  skipped: DiscussionSkip[];
}

export interface DiscussionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxSnippets?: number;
}

const INTERVIEW_WORDS =
  /\b(interview|interviewing|interviewed|hiring process|take-home|onsite|on-site|recruiter|offer)\b/i;

export async function searchPublicDiscussion(
  company: string,
  opts: DiscussionOptions = {},
): Promise<DiscussionResult> {
  const name = company.trim();
  const query = `${name} interview`;
  if (name.length < 2) return { query, snippets: [], skipped: [] };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const maxSnippets = opts.maxSnippets ?? 8;
  const skipped: DiscussionSkip[] = [];

  const [hn, reddit] = await Promise.all([
    searchHackerNews(query, fetchImpl, timeoutMs).catch((e: Error) => {
      skipped.push({ source: 'hackernews', reason: e.message });
      return [] as DiscussionSnippet[];
    }),
    searchReddit(query, fetchImpl, timeoutMs).catch((e: Error) => {
      skipped.push({ source: 'reddit', reason: e.message });
      return [] as DiscussionSnippet[];
    }),
  ]);

  const nameRe = new RegExp(escapeRe(name), 'i');
  const seen = new Set<string>();
  const snippets = [...hn, ...reddit]
    .filter(
      (s) => nameRe.test(`${s.title} ${s.text}`) && INTERVIEW_WORDS.test(`${s.title} ${s.text}`),
    )
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, maxSnippets);

  return { query, snippets, skipped };
}

async function searchHackerNews(query: string, fetchImpl: typeof fetch, timeoutMs: number) {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=(story,comment)&hitsPerPage=20`;
  const data = (await getJson(url, fetchImpl, timeoutMs)) as {
    hits?: {
      objectID: string;
      title?: string | null;
      story_title?: string | null;
      url?: string | null;
      comment_text?: string | null;
      story_text?: string | null;
      created_at_i?: number;
    }[];
  };
  return (data.hits ?? []).map((h): DiscussionSnippet => ({
    source: 'hackernews',
    title: h.title ?? h.story_title ?? '',
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    text: stripHtml(h.comment_text ?? h.story_text ?? '').slice(0, 600),
    createdAt: h.created_at_i ?? null,
  }));
}

async function searchReddit(query: string, fetchImpl: typeof fetch, timeoutMs: number) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=20&raw_json=1`;
  const data = (await getJson(url, fetchImpl, timeoutMs)) as {
    data?: {
      children?: {
        data: { title?: string; selftext?: string; permalink?: string; created_utc?: number };
      }[];
    };
  };
  return (data.data?.children ?? []).map((c): DiscussionSnippet => ({
    source: 'reddit',
    title: c.data.title ?? '',
    url: `https://www.reddit.com${c.data.permalink ?? ''}`,
    text: (c.data.selftext ?? '').slice(0, 600),
    createdAt: c.data.created_utc ?? null,
  }));
}

async function getJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
  });
  if (res.status !== 200) throw new Error(`http_${res.status}`);
  const text = await res.text();
  if (text.length > 2_000_000) throw new Error('too_large');
  return JSON.parse(text);
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
