import { describe, expect, it } from 'vitest';
import { makeValidKit } from '../testing/fixtures.js';
import { validateKit } from '../validation/validate-kit.js';
import {
  addFlashcard,
  addQuestion,
  deleteItem,
  editBrief,
  editQuestion,
  mergeRegeneratedFlashcards,
  mergeRegeneratedQuestions,
  moveQuestion,
  rebuildSchedule,
  reorderQuestions,
  replaceBrief,
  setPinned,
  type Builder,
} from './edits.js';
import { initMeta, orderedQuestions } from './meta.js';

function fresh(): Builder {
  const kit = makeValidKit();
  return { kit, meta: initMeta(kit) };
}
const fq = (prompt: string, ids: string[] = ['r1']) => ({
  prompt,
  answer_outline: '',
  requirement_ids: ids,
  difficulty: 2 as const,
});

describe('builder edits keep the kit valid and ids stable', () => {
  it('editing marks the item edited and recomputes coverage and schedule', () => {
    const b = editQuestion(fresh(), 'q1', {
      prompt: 'Edited prompt',
      requirement_ids: ['r1', 'r3'],
    });
    expect(b.meta.items.q1).toMatchObject({ origin: 'edited' });
    expect(validateKit(b.kit).ok).toBe(true);
    expect(b.kit.questions.find((q) => q.id === 'q1')!.prompt).toBe('Edited prompt');
  });

  it('rejects an edit that references an unknown requirement', () => {
    expect(() => editQuestion(fresh(), 'q1', { requirement_ids: ['r9'] })).toThrow(
      /unknown requirement/,
    );
  });

  it('adds a manual question with the next free id, even after deletions left a gap', () => {
    let b = deleteItem(fresh(), 'q2');
    b = addQuestion(b, { category: 'behavioural', ...fq('Manual one', ['r2']) });
    expect(b.kit.questions.map((q) => q.id)).toContain('q4');
    expect(b.meta.items.q4).toMatchObject({ origin: 'manual' });
    expect(b.kit.coverage.uncovered_requirement_ids).toEqual([]); // r2 covered again by the manual question
    expect(validateKit(b.kit).ok).toBe(true);
  });

  it('deleting a question drops it from schedule and order and reports the coverage gap honestly', () => {
    const b = deleteItem(fresh(), 'q2');
    expect(b.kit.schedule.days.flatMap((d) => d.question_ids)).not.toContain('q2');
    expect(b.kit.coverage.uncovered_requirement_ids).toEqual(['r2']);
    expect(validateKit(b.kit).ok).toBe(true);
  });

  it('reorder is a permutation check and changes only order', () => {
    let b = addQuestion(fresh(), { category: 'technical', ...fq('Second technical') });
    expect(() => reorderQuestions(b, 'technical', ['q1'])).toThrow(/permutation/);
    b = reorderQuestions(b, 'technical', ['q4', 'q1']);
    expect(orderedQuestions(b.kit, b.meta).map((q) => q.id)).toEqual(['q4', 'q1', 'q2', 'q3']);
    expect(b.kit.questions[0]!.prompt).toBe('Second technical');
  });

  it('moves a question between categories at a position', () => {
    const b = moveQuestion(fresh(), 'q3', 'technical', 0);
    expect(b.kit.questions.find((q) => q.id === 'q3')!.category).toBe('technical');
    expect(b.meta.order.technical).toEqual(['q3', 'q1']);
    expect(b.meta.order['system-design']).toEqual([]);
  });
});

describe('regeneration preserves what the user did (ADR 0008)', () => {
  it('replaces only generated, unpinned questions of that category; edited, manual and pinned survive in place', () => {
    let b = fresh();
    b = addQuestion(b, { category: 'technical', ...fq('Manual Q') }); // q4 manual
    b = addQuestion(b, { category: 'technical', ...fq('Will be pinned') }); // q5 manual → make it generated then pin
    b.meta.items.q5 = { ...b.meta.items.q5!, origin: 'generated' };
    b = setPinned(b, 'q5', true);
    b = editQuestion(b, 'q1', { prompt: 'User edited q1' });
    b = addQuestion(b, { category: 'technical', ...fq('Plain generated') }); // q6, then pretend generated
    b.meta.items.q6 = { ...b.meta.items.q6!, origin: 'generated' };
    const before = b.meta.order.technical;
    expect(before).toEqual(['q1', 'q4', 'q5', 'q6']);

    b = mergeRegeneratedQuestions(b, 'technical', [fq('Fresh A'), fq('Fresh B', ['r1', 'r9'])]);

    const ids = b.meta.order.technical!;
    expect(ids.slice(0, 3)).toEqual(['q1', 'q4', 'q5']); // survivors keep their positions
    expect(ids).not.toContain('q6'); // plain generated replaced
    expect(ids.slice(3)).toEqual(['q7', 'q8']); // new ids never reuse q6
    expect(b.kit.questions.find((q) => q.id === 'q1')!.prompt).toBe('User edited q1');
    expect(b.kit.questions.find((q) => q.id === 'q8')!.requirement_ids).toEqual(['r1']); // unknown r9 stripped
    expect(b.meta.gens['questions:technical']).toBe(2);
    expect(b.meta.items.q7).toMatchObject({ origin: 'generated', gen: 2 });
    // other categories untouched
    expect(b.kit.questions.filter((q) => q.category !== 'technical').map((q) => q.id)).toEqual([
      'q2',
      'q3',
    ]);
    expect(validateKit(b.kit).ok).toBe(true);
  });

  it('regenerating the brief does not touch questions; editing the brief marks it edited', () => {
    let b = editQuestion(fresh(), 'q1', { prompt: 'kept' });
    b = editBrief(b, { summary: 'my summary' });
    expect(b.meta.sections.company_brief.origin).toBe('edited');
    b = replaceBrief(b, { summary: 'regenerated', what_they_do: 'x', sources: [] });
    expect(b.kit.company_brief.summary).toBe('regenerated');
    expect(b.meta.sections.company_brief.origin).toBe('generated');
    expect(b.kit.questions.find((q) => q.id === 'q1')!.prompt).toBe('kept');
  });

  it('flashcard regeneration keeps edited and manual cards', () => {
    let b = addFlashcard(fresh(), { front: 'mine', back: 'b', requirement_ids: ['r1'] });
    b = mergeRegeneratedFlashcards(b, [{ front: 'new', back: 'n', requirement_ids: ['r2'] }]);
    expect(b.kit.flashcards.map((f) => [f.id, f.front])).toEqual([
      ['f2', 'mine'],
      ['f3', 'new'],
    ]);
  });

  it('schedule regeneration is deterministic and can change the day count', () => {
    const b = rebuildSchedule(fresh(), 4);
    expect(b.kit.schedule.days).toHaveLength(4);
    expect(b.kit.schedule.days_available).toBe(4);
    expect(validateKit(b.kit).ok).toBe(true);
    expect(rebuildSchedule(fresh(), 4).kit.schedule).toEqual(b.kit.schedule);
  });
});
