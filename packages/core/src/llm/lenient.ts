// Models drift from the requested shape in predictable ways (null for an unknown string, an
// array of bullet points for a paragraph). Accepting those directly saves a repair round-trip.
import { z } from 'zod';

/** string; null/undefined → ''; array → joined bullet list; number/boolean → String(v). */
export const looseString = z.preprocess((v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v))
    return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n- ');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return v;
}, z.string());

/** array of strings; null → []; a lone string → [string]. */
export const looseStringArray = z.preprocess((v) => {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return [v];
  return v;
}, z.array(z.string()));

/** Wrap a bare root array as `{ [key]: array }` — flash-lite often answers with the list alone. */
export function rootArrayAs(key: string) {
  return (v: unknown) => (Array.isArray(v) ? { [key]: v } : v);
}
