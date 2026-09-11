// HTML → text the model can read, plus the links the crawler needs (TRAO-7).
import * as cheerio from 'cheerio';

export interface PageLink {
  href: string;
  text: string;
}

export interface CleanedPage {
  url: string;
  title: string;
  text: string;
  links: PageLink[];
}

const NOISE =
  'script, style, noscript, svg, iframe, nav, footer, header, form, [aria-hidden="true"]';

export function cleanPage(url: string, html: string, contentType = 'text/html'): CleanedPage {
  if (contentType.startsWith('text/plain')) {
    return { url, title: '', text: normalise(html), links: [] };
  }
  const $ = cheerio.load(html);
  const title = normalise($('title').first().text());
  const base = $('base[href]').attr('href');
  const baseUrl = safeUrl(base ?? url, url)?.href ?? url;

  const links: PageLink[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const raw = ($(el).attr('href') ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return;
    const abs = safeUrl(raw, baseUrl);
    if (!abs || (abs.protocol !== 'http:' && abs.protocol !== 'https:')) return;
    abs.hash = '';
    if (seen.has(abs.href)) return;
    seen.add(abs.href);
    links.push({ href: abs.href, text: normalise($(el).text()).slice(0, 120) });
  });

  $(NOISE).remove();
  const root = $('main').length ? $('main') : $('body');
  // Block-level boundaries become newlines so headings and paragraphs stay separated.
  root.find('h1, h2, h3, h4, h5, h6, p, li, tr, br, div, section, article').each((_, el) => {
    $(el).append('\n');
  });
  const text = normalise(root.text());
  return { url, title, text, links };
}

function safeUrl(href: string, base: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

function normalise(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
