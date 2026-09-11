// Practice ordering (Section 7): confidence-weighted with a recency tiebreak, not full spaced
// repetition. The horizon is the days until the interview, so "weakest first, then stalest" beats
// interval scheduling designed for months.
import type { Flashcard } from '../validation/kit-schema.js';

export type Confidence = 1 | 2 | 3;

export interface CardProgress {
  confidence: Confidence;
  /** ISO timestamp of the last rating. */
  seenAt: string;
  reviews: number;
}

export type PracticeState = Record<string, CardProgress>;

export interface PracticeSummary {
  total: number;
  covered: number;
  byConfidence: Record<Confidence, number>;
}

/**
 * Order for the next session: unseen cards first (confidence 0), then ascending confidence, ties
 * broken by least recently seen, then by kit order. Cards no longer in the kit are ignored.
 */
export function buildPracticeOrder(cards: Flashcard[], state: PracticeState): Flashcard[] {
  return cards
    .map((card, index) => ({ card, index, p: state[card.id] }))
    .sort((a, b) => {
      const ca = a.p?.confidence ?? 0;
      const cb = b.p?.confidence ?? 0;
      if (ca !== cb) return ca - cb;
      const ta = a.p ? Date.parse(a.p.seenAt) : 0;
      const tb = b.p ? Date.parse(b.p.seenAt) : 0;
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    })
    .map((x) => x.card);
}

export function summarisePractice(cards: Flashcard[], state: PracticeState): PracticeSummary {
  const byConfidence: Record<Confidence, number> = { 1: 0, 2: 0, 3: 0 };
  let covered = 0;
  for (const c of cards) {
    const p = state[c.id];
    if (!p) continue;
    covered += 1;
    byConfidence[p.confidence] += 1;
  }
  return { total: cards.length, covered, byConfidence };
}

export function rateCard(
  state: PracticeState,
  cardId: string,
  confidence: Confidence,
  now = new Date(),
): PracticeState {
  const prev = state[cardId];
  return {
    ...state,
    [cardId]: { confidence, seenAt: now.toISOString(), reviews: (prev?.reviews ?? 0) + 1 },
  };
}
