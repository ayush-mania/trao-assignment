// Batch entry point (Section 9, Appendix B):
//   npm run evaluate -- --input <cases.json> --output <kits.json> [--concurrency 1]
// Runs the exact pipeline the web app uses (packages/core runToCompletion) over each case,
// continues after failures, and writes one JSON file.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  llmClientFromEnv,
  loadDotEnv,
  runToCompletion,
  type RunDeps,
  type RunState,
} from '@trao/core';

interface Case {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

interface OutputEntry {
  id: string;
  status: 'ok' | 'failed';
  kit: unknown | null;
  error: { code: string; message: string } | null;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error(
      'usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--concurrency N]',
    );
    return 2;
  }
  loadDotEnv(resolve(process.cwd(), '.env'));

  let cases: Case[];
  try {
    const parsed = JSON.parse(await readFile(resolve(args.input), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('input must be a JSON array of cases');
    cases = parsed as Case[];
  } catch (err) {
    console.error(`cannot read cases: ${(err as Error).message}`);
    return 2;
  }

  let deps: RunDeps;
  try {
    deps = {
      llm: llmClientFromEnv(process.env, (e) => log(`  llm ${e.type}: ${JSON.stringify(e)}`)),
      crawl: {
        policy: { allowPrivate: process.env.ALLOW_PRIVATE_URLS === 'true' },
        timeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 10_000),
        maxPages: Number(process.env.CRAWL_MAX_PAGES ?? 12),
        maxBytes: Number(process.env.FETCH_MAX_BYTES ?? 1_500_000),
      },
    };
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }

  const startedAll = Date.now();
  const concurrency = Math.max(1, Number(args.concurrency ?? 1));
  const results: OutputEntry[] = [];
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) results.push(await runCase(c, deps));
    }),
  );

  const output = { version: '1.0', generated_at: new Date().toISOString(), kits: results };
  await writeFile(resolve(args.output), JSON.stringify(output, null, 2));
  const ok = results.filter((r) => r.status === 'ok').length;
  log(
    `done: ${ok}/${results.length} ok in ${((Date.now() - startedAll) / 1000).toFixed(1)}s → ${args.output}`,
  );
  return 0;
}

async function runCase(c: Case, deps: RunDeps): Promise<OutputEntry> {
  const id = String(c?.id ?? 'unknown');
  const started = Date.now();
  log(`[${id}] start (days=${c?.days})`);
  try {
    if (!c || typeof c.jd !== 'string' || typeof c.company_url !== 'string') {
      return {
        id,
        status: 'failed',
        kit: null,
        error: { code: 'INVALID_INPUT', message: 'case needs id, jd, company_url, days' },
      };
    }
    const state = await runToCompletion(
      { jd: c.jd, company_url: c.company_url, days: Number(c.days) },
      deps,
      (s: RunState) => {
        const last = s.steps[s.steps.length - 1];
        if (last)
          log(`[${id}]   ${last.name} ${last.status} ${last.ms}ms — ${last.notes.join(' | ')}`);
      },
    );
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (state.status === 'done' && state.artifacts.kit) {
      log(`[${id}] ok in ${secs}s`);
      return { id, status: 'ok', kit: state.artifacts.kit, error: null };
    }
    const error = state.error ?? { code: 'INTERNAL', message: 'run ended without a kit' };
    log(`[${id}] failed in ${secs}s: ${error.code} ${error.message}`);
    return { id, status: 'failed', kit: null, error };
  } catch (err) {
    // The pipeline reports its own failures; this is the last line of defence so one case never aborts the run.
    const message = err instanceof Error ? err.message : String(err);
    log(`[${id}] crashed: ${message}`);
    return { id, status: 'failed', kit: null, error: { code: 'INTERNAL', message } };
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      out[k!] = inline ?? argv[++i] ?? '';
    }
  }
  return out;
}

function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

main().then((code) => process.exit(code));
