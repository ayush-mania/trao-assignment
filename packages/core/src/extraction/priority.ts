// must / nice is decided by how the posting words it (Section 5), not by the model's opinion.
// We look at the sentence around the evidence and at the nearest heading above it.

const NICE_WORDS =
  /\b(nice[- ]to[- ]have|bonus|(?:a|is a|big|huge|definite) plus|plus:|preferred|preferably|ideally|desirable|advantage|would be great|optional|good to have|familiarity with|exposure to)\b/i;
// Only words that state requiredness. Depth adjectives (strong, proven, expert) describe level, not
// whether the item is required, so they must not beat a "Nice to have" heading.
const MUST_WORDS = /\b(required|must|mandatory|essential|minimum|non-negotiable)\b/i;
const NICE_HEADING =
  /\b(nice[- ]to[- ]have|bonus|preferred|plus|desirable|good to have|would be great)\b/i;
const MUST_HEADING =
  /\b(requirements?|qualifications?|must[- ]haves?|what you(?:'ll)? (?:need|bring)|who you are|essential|minimum)\b/i;

export type Priority = 'must' | 'nice';

export interface PriorityContext {
  /** The JD text, used to find the evidence position, its sentence and the heading above it. */
  jd: string;
  evidence: string;
}

/**
 * Wording rule, in order of specificity:
 *  1. explicit nice/bonus phrasing in the evidence's own sentence → nice
 *  2. explicit must phrasing in the sentence → must
 *  3. nearest heading above the evidence: nice-ish heading → nice, must-ish heading → must
 *  4. default must (postings list requirements far more often than perks)
 */
export function derivePriority({ jd, evidence }: PriorityContext): Priority {
  const idx = bestOccurrence(jd, evidence);
  if (idx < 0) return 'must';
  const sentence = sentenceAround(jd, idx, evidence.length);
  if (NICE_WORDS.test(sentence)) return 'nice';
  if (MUST_WORDS.test(sentence)) return 'must';
  const heading = headingAbove(jd, idx);
  if (heading && NICE_HEADING.test(heading)) return 'nice';
  if (heading && MUST_HEADING.test(heading)) return 'must';
  return 'must';
}

/**
 * The evidence phrase may appear several times (e.g. "Kubernetes" in the intro and again under
 * "Nice to have"). Prefer the occurrence that sits in a list item, since that is where the posting
 * states it as a requirement; otherwise the first occurrence.
 */
function bestOccurrence(jd: string, evidence: string): number {
  const occurrences = allOccurrences(jd, evidence);
  if (occurrences.length === 0) return -1;
  const inList = occurrences.find((i) => /^\s*[-*•·\u2022\d.)]+\s*/.test(lineOf(jd, i)));
  return inList ?? occurrences[0]!;
}

function allOccurrences(jd: string, evidence: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (let guard = 0; guard < 20; guard++) {
    const i = indexOfLoose(jd.slice(from), evidence);
    if (i < 0) break;
    out.push(from + i);
    from = from + i + Math.max(1, evidence.length);
  }
  return out;
}

function lineOf(text: string, idx: number): string {
  const start = text.lastIndexOf('\n', idx) + 1;
  const end = text.indexOf('\n', idx);
  return text.slice(start, end < 0 ? text.length : end);
}

/** Case- and whitespace-insensitive search; returns the index in `haystack` or -1. */
export function indexOfLoose(haystack: string, needle: string): number {
  const n = needle.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!n) return -1;
  const h = haystack.toLowerCase();
  const direct = h.indexOf(n);
  if (direct >= 0) return direct;
  // Collapse whitespace in the haystack while keeping a map back to original offsets.
  const map: number[] = [];
  let collapsed = '';
  let lastSpace = false;
  for (let i = 0; i < h.length; i++) {
    const c = h[i]!;
    const isSpace = /\s/.test(c);
    if (isSpace && lastSpace) continue;
    collapsed += isSpace ? ' ' : c;
    map.push(i);
    lastSpace = isSpace;
  }
  const at = collapsed.indexOf(n);
  return at >= 0 ? (map[at] ?? -1) : -1;
}

function sentenceAround(text: string, idx: number, len: number): string {
  const start = Math.max(text.lastIndexOf('\n', idx), text.lastIndexOf('. ', idx), 0);
  const endCandidates = [text.indexOf('\n', idx + len), text.indexOf('. ', idx + len)].filter(
    (i) => i >= 0,
  );
  const end = endCandidates.length ? Math.min(...endCandidates) : text.length;
  return text.slice(start, end);
}

function headingAbove(text: string, idx: number): string | null {
  const before = text.slice(0, idx).split('\n');
  for (let i = before.length - 2; i >= 0 && i > before.length - 40; i--) {
    const line = before[i]!.trim();
    if (!line || line.length > 60) continue;
    // Only a line that reads as a section heading counts; a plain requirement line that lost its
    // bullet on paste must not become the "heading" for everything below it.
    if (NICE_HEADING.test(line) || MUST_HEADING.test(line)) return line;
  }
  return null;
}
