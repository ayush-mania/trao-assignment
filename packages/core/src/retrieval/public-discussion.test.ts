import { describe, expect, it } from 'vitest';
import { searchPublicDiscussion } from './public-discussion.js';

function fakeFetch(byHost: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (input: string | URL) => {
    const u = new URL(typeof input === 'string' ? input : input.href);
    const h = byHost[u.hostname];
    if (!h) return new Response('{}', { status: 404 });
    return h();
  }) as typeof fetch;
}

const hnHit = (id: string, text: string, created: number) => ({
  objectID: id,
  story_title: 'Ask HN: Who is hiring?',
  comment_text: text,
  created_at_i: created,
});

describe('searchPublicDiscussion', () => {
  it('merges, filters to company+interview mentions, dedupes and sorts newest first', async () => {
    const r = await searchPublicDiscussion('Acme Robotics', {
      fetchImpl: fakeFetch({
        'hn.algolia.com': () =>
          Response.json({
            hits: [
              hnHit('1', 'Acme Robotics <b>interview</b> was a take-home then system design.', 100),
              hnHit('2', 'Unrelated comment about robotics in general.', 200),
              hnHit('3', 'Acme Robotics makes great robots.', 300),
            ],
          }),
        'www.reddit.com': () =>
          Response.json({
            data: {
              children: [
                {
                  data: {
                    title: 'Acme Robotics onsite experience',
                    selftext: 'Four rounds, recruiter was helpful.',
                    permalink: '/r/cscareerquestions/comments/x/acme/',
                    created_utc: 400,
                  },
                },
              ],
            },
          }),
      }),
    });
    expect(r.snippets.map((s) => s.source)).toEqual(['reddit', 'hackernews']);
    expect(r.snippets[1]!.text).toBe('Acme Robotics interview was a take-home then system design.');
    expect(r.snippets[0]!.url).toBe('https://www.reddit.com/r/cscareerquestions/comments/x/acme/');
    expect(r.skipped).toEqual([]);
  });

  it('records a failing source and keeps the other', async () => {
    const r = await searchPublicDiscussion('Acme', {
      fetchImpl: fakeFetch({
        'hn.algolia.com': () => new Response('rate limited', { status: 429 }),
        'www.reddit.com': () => Response.json({ data: { children: [] } }),
      }),
    });
    expect(r.snippets).toEqual([]);
    expect(r.skipped).toEqual([{ source: 'hackernews', reason: 'http_429' }]);
  });

  it('returns nothing, honestly, for an unknown company', async () => {
    const r = await searchPublicDiscussion('Northwind Analytics', {
      fetchImpl: fakeFetch({
        'hn.algolia.com': () => Response.json({ hits: [] }),
        'www.reddit.com': () => Response.json({ data: { children: [] } }),
      }),
    });
    expect(r).toEqual({ query: 'Northwind Analytics interview', snippets: [], skipped: [] });
  });

  it('skips the search for an empty company name', async () => {
    const r = await searchPublicDiscussion(' ', { fetchImpl: fakeFetch({}) });
    expect(r.snippets).toEqual([]);
  });
});
