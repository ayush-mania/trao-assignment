// Serves fixtures/sites on http://localhost:8099 for tests and the batch demo (Section 9 uses a local host).
// /acme/ -> acme/index.html, /acme/company/team -> company/team.html, /acme/blog/ -> blog.html or blog/index.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const root = join(process.cwd(), 'fixtures', 'sites');
const port = Number(process.env.FIXTURES_PORT ?? 8099);

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')).replace(
    /\\/g,
    '/',
  );
  if (path.includes('..')) return end(res, 400, 'bad path');
  const candidates = path.endsWith('/')
    ? [`${path}index.html`, `${path.slice(0, -1)}.html`]
    : [path, `${path}.html`, `${path}/index.html`];
  for (const c of candidates) {
    try {
      const body = await readFile(join(root, c));
      const type = c.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': type });
      return res.end(body);
    } catch {
      /* try next */
    }
  }
  end(res, 404, 'not found');
});

function end(res: import('node:http').ServerResponse, status: number, msg: string) {
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end(msg);
}

server.listen(port, () => console.log(`fixtures on http://localhost:${port}/acme/ and /nohire/`));
