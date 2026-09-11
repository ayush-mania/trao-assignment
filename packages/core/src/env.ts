// Minimal .env loader (KEY=value, # comments, optional quotes). Never overrides variables already
// set in the process, so CI and hosting platforms win over a local file.
import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(
  path: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const hash = value.search(/\s#/);
    if (hash >= 0 && !/^["']/.test(value)) value = value.slice(0, hash).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
}
