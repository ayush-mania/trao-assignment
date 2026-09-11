// must / nice is decided by how the posting words it (Section 5), not by the model's opinion.
// We look at the sentence around the evidence and at the nearest heading above it.

const NICE_WORDS =
  /\b(nice[- ]to[- ]have|bonus|plus|preferred|preferably|ideally|desirable|advantage|a big plus|would be great|optional|good to have|familiarity with|exposure to)\b/i;
const MUST_WORDS =
  /\b(required|requirements?|must|need(?:ed|s)?|minimum|essential|mandatory|you have|you bring|you will need|strong|proven|expert)\b/i;
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
  const idx = indexOfLoose(jd, evidence);
  if (idx < 0) return 'must';
  const sentence = sentenceAround(jd, idx, evidence.length);
  if (NICE_WORDS.test(sentence)) return 'nice';
  if (MUST_WORDS.test(sentence)) return 'must';
  const heading = headingAbove(jd, idx);
  if (heading && NICE_HEADING.test(heading)) return 'nice';
  if (heading && MUST_HEADING.test(heading)) return 'must';
  return 'must';
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
    if (!line) continue;
    // A heading is a short line without a bullet, often ending with ':' or in Title Case.
    if (
      line.length <= 60 &&
      !/^[-*•\d]/.test(line) &&
      (line.endsWith(':') || /^[A-Z]/.test(line)) &&
      !/[.!?]$/.test(line)
    ) {
      return line;
    }
  }
  return null;
}
