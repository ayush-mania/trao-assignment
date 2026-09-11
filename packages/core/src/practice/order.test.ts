import { describe, expect, it } from 'vitest';
import type { Flashcard } from '../validation/kit-schema.js';
import { buildPracticeOrder, rateCard, summarisePractice } from './order.js';

const card = (id: string): Flashcard => ({ id, front: id, back: '', requirement_ids: [] });
const cards = ['f1', 'f2', 'f3', 'f4', 'f5'].map(card);

describe('practice ordering (Section 7: next session by least confidence)', () => {
  it('puts unseen cards first, then lowest confidence, ties by least recently seen, then kit order', () => {
    const state = {
      f1: { confidence: 3 as const, seenAt: '2026-09-11T10:00:00Z', reviews: 1 },
      f2: { confidence: 1 as const, seenAt: '2026-09-11T12:00:00Z', reviews: 2 },
      f3: { confidence: 1 as const, seenAt: '2026-09-11T09:00:00Z', reviews: 1 },
      f5: { confidence: 2 as const, seenAt: '2026-09-11T11:00:00Z', reviews: 1 },
    };
    expect(buildPracticeOrder(cards, state).map((c) => c.id)).toEqual([
      'f4',
      'f3',
      'f2',
      'f5',
      'f1',
    ]);
  });

  it('ignores progress for cards that were deleted from the kit and reports coverage honestly', () => {
    const state = {
      f9: { confidence: 1 as const, seenAt: '2026-09-11T10:00:00Z', reviews: 1 },
      f1: { confidence: 2 as const, seenAt: '2026-09-11T10:00:00Z', reviews: 1 },
    };
    expect(buildPracticeOrder(cards, state).map((c) => c.id)).toEqual([
      'f2',
      'f3',
      'f4',
      'f5',
      'f1',
    ]);
    expect(summarisePractice(cards, state)).toEqual({
      total: 5,
      covered: 1,
      byConfidence: { 1: 0, 2: 1, 3: 0 },
    });
  });

  it('rating a card again keeps the review count and moves it to the back of its confidence group', () => {
    let state = rateCard({}, 'f1', 1, new Date('2026-09-11T10:00:00Z'));
    state = rateCard(state, 'f2', 1, new Date('2026-09-11T10:01:00Z'));
    state = rateCard(state, 'f1', 1, new Date('2026-09-11T10:02:00Z'));
    expect(state.f1).toMatchObject({ reviews: 2 });
    expect(buildPracticeOrder(cards.slice(0, 2), state).map((c) => c.id)).toEqual(['f2', 'f1']);
  });
});
