// In-process stand-in for `npm run fixtures`: serves fixtures/sites from disk to a fetch-shaped call.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), '..', '..', 'fixtures', 'sites');

export const fixtureFetch = (async (input: string | URL) => {
  const u = new URL(typeof input === 'string' ? input : input.href);
  if (u.hostname !== 'localhost')
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  const p = u.pathname;
  const candidates = p.endsWith('/')
    ? [`${p}index.html`, `${p.slice(0, -1)}.html`]
    : [p, `${p}.html`, `${p}/index.html`];
  for (const c of candidates) {
    try {
      const body = await readFile(join(root, c), 'utf8');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': c.endsWith('.txt') ? 'text/plain' : 'text/html' },
      });
    } catch {
      /* next */
    }
  }
  return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
}) as typeof fetch;
