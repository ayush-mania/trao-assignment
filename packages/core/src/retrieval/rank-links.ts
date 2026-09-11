// Which links on a company site are worth fetching. Scored from URL path and anchor text, so a
// hiring page is found wherever it lives (/careers, /jobs, a handbook, a blog post) — the brief
// says a fixed path list is not enough. Pure function; the crawler picks the highest score next.
import type { PageLink } from './clean-page.js';

export type PageKind = 'hiring' | 'about' | 'other';

const HIRING = [
  ['interview', 6],
  ['how-we-hire', 6],
  ['hiring', 5],
  ['careers', 5],
  ['career', 5],
  ['jobs', 5],
  ['job', 3],
  ['join', 4],
  ['recruit', 4],
  ['work-with-us', 4],
  ['work with us', 4],
  ['openings', 4],
  ['open roles', 4],
  ['handbook', 3],
  ['apply', 2],
] as const;

const ABOUT = [
  ['about', 4],
  ['company', 3],
  ['team', 3],
  ['culture', 3],
  ['values', 3],
  ['mission', 3],
  ['who we are', 3],
  ['what we do', 3],
  ['engineering', 2],
  ['blog', 1],
  ['story', 1],
] as const;

const NOISE = [
  'login',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'register',
  'privacy',
  'terms',
  'cookie',
  'legal',
  'pricing',
  'cart',
  'checkout',
  'download',
  'status',
  'docs/api',
  'support',
  'help',
  'press',
  'news',
  'events',
  'partners',
  'investors',
  'sitemap',
  'search',
  'tag/',
  'category/',
  'page/',
  'wp-content',
  'feed',
  'rss',
  '.pdf',
  '.zip',
  '.png',
  '.jpg',
  '.svg',
];

export interface RankedLink extends PageLink {
  score: number;
}

export function scoreLink(link: PageLink, origin: string): number {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return -100;
  }
  if (url.origin !== origin) return -100; // same-site only
  const path = url.pathname.toLowerCase();
  const anchor = link.text.toLowerCase();
  const hay = `${path} ${anchor}`;
  if (NOISE.some((n) => hay.includes(n))) return -50;

  let score = 0;
  for (const [word, w] of HIRING) if (hay.includes(word)) score += w;
  for (const [word, w] of ABOUT) if (hay.includes(word)) score += w;
  // Shallow pages first, but do not bury a deep hiring page: depth costs less than one strong word.
  const depth = path.split('/').filter(Boolean).length;
  score -= Math.min(depth, 5) * 0.5;
  if (path === '/' || path === '') score -= 1;
  return score;
}

export function rankLinks(links: PageLink[], origin: string): RankedLink[] {
  return links
    .map((l) => ({ ...l, score: scoreLink(l, origin) }))
    .filter((l) => l.score > -50)
    .sort((a, b) => b.score - a.score);
}

const HIRING_SIGNALS = [
  'interview process',
  'interview',
  'we are hiring',
  "we're hiring",
  'open positions',
  'open roles',
  'take-home',
  'take home',
  'onsite',
  'on-site',
  'hiring process',
  'recruiter',
  'apply now',
  'system design',
  'coding challenge',
  'pair programming',
];
const ABOUT_SIGNALS = [
  'what we do',
  'we build',
  'we help',
  'our mission',
  'founded',
  'our team',
  'a team of',
  'about us',
  'about ',
  'we are a',
  'our values',
  'our story',
  'customers',
  'we design',
  'we operate',
  'we work',
  'headquartered',
  'based in',
  'engineers',
];

/** Classify a fetched page mainly from its own text (title + body); the URL path is weaker evidence. */
export function classifyPage(title: string, text: string, url = ''): PageKind {
  const hay = `${title}\n${text.slice(0, 6000)}`.toLowerCase();
  const path = safePath(url);
  const hiring =
    HIRING_SIGNALS.filter((s) => hay.includes(s)).length +
    (HIRING.some(([w]) => path.includes(w)) ? 1 : 0);
  const about =
    ABOUT_SIGNALS.filter((s) => hay.includes(s)).length +
    (ABOUT.some(([w]) => path.includes(w)) ? 1 : 0);
  if (hiring >= 2 && hiring >= about) return 'hiring';
  if (about >= 2) return 'about';
  return 'other';
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}
