// Pure operations on { kit, meta }. Every one returns a new pair; the API persists it after
// validateKit. Deterministic bookkeeping (coverage, schedule) is recomputed after any question change.
import { findGaps } from '../coverage/coverage.js';
import { buildSchedule } from '../schedule/allocate.js';
import {
  QUESTION_CATEGORIES,
  type Flashcard,
  type Kit,
  type Question,
  type QuestionCategory,
} from '../validation/kit-schema.js';
import { allocId, orderedQuestions, type KitMeta } from './meta.js';

export interface Builder {
  kit: Kit;
  meta: KitMeta;
}

export class BuilderError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'BAD_ORDER' | 'BAD_REQUIREMENT' | 'BAD_CATEGORY',
    message: string,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();

function clone<T>(v: T): T {
  return structuredClone(v);
}

function assertRequirementIds(kit: Kit, ids: string[]): void {
  const known = new Set(kit.role.requirements.map((r) => r.id));
  const bad = ids.filter((id) => !known.has(id));
  if (bad.length)
    throw new BuilderError('BAD_REQUIREMENT', `unknown requirement id(s): ${bad.join(', ')}`);
}

/** After any change to questions: coverage is a set difference, the schedule is rebuilt (ADR 0004). */
function recompute(b: Builder): Builder {
  const kit = clone(b.kit);
  kit.questions = orderedQuestions(kit, b.meta);
  kit.coverage = {
    ...kit.coverage,
    uncovered_requirement_ids: findGaps(kit.role.requirements, kit.questions).uncovered,
  };
  kit.schedule = buildSchedule(kit.schedule.days_available, kit.role.requirements, kit.questions);
  return { kit, meta: b.meta };
}

export type QuestionPatch = Partial<
  Pick<Question, 'prompt' | 'answer_outline' | 'difficulty' | 'requirement_ids'>
>;
export type FlashcardPatch = Partial<Pick<Flashcard, 'front' | 'back' | 'requirement_ids'>>;

export function editQuestion(b: Builder, id: string, patch: QuestionPatch): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const q = kit.questions.find((x) => x.id === id);
  if (!q) throw new BuilderError('NOT_FOUND', `no question ${id}`);
  if (patch.requirement_ids) assertRequirementIds(kit, patch.requirement_ids);
  Object.assign(q, patch);
  meta.items[id] = {
    ...(meta.items[id] ?? { origin: 'generated', pinned: false, gen: 1 }),
    origin: meta.items[id]?.origin === 'manual' ? 'manual' : 'edited',
    updatedAt: now(),
  };
  return recompute({ kit, meta });
}

export function editFlashcard(b: Builder, id: string, patch: FlashcardPatch): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const f = kit.flashcards.find((x) => x.id === id);
  if (!f) throw new BuilderError('NOT_FOUND', `no flashcard ${id}`);
  if (patch.requirement_ids) assertRequirementIds(kit, patch.requirement_ids);
  Object.assign(f, patch);
  meta.items[id] = {
    ...(meta.items[id] ?? { origin: 'generated', pinned: false, gen: 1 }),
    origin: meta.items[id]?.origin === 'manual' ? 'manual' : 'edited',
    updatedAt: now(),
  };
  return { kit, meta };
}

export function editBrief(
  b: Builder,
  patch: Partial<Pick<Kit['company_brief'], 'summary' | 'what_they_do'>>,
): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  Object.assign(kit.company_brief, patch);
  meta.sections.company_brief.origin = 'edited';
  return { kit, meta };
}

export function addQuestion(b: Builder, input: Omit<Question, 'id'>, index?: number): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  assertRequirementIds(kit, input.requirement_ids);
  const id = allocId(meta, 'q');
  kit.questions.push({ id, ...input });
  meta.items[id] = {
    origin: 'manual',
    pinned: false,
    gen: meta.gens[`questions:${input.category}`] ?? 1,
    updatedAt: now(),
  };
  const list = meta.order[input.category] ?? [];
  list.splice(index ?? list.length, 0, id);
  meta.order[input.category] = list;
  return recompute({ kit, meta });
}

export function addFlashcard(b: Builder, input: Omit<Flashcard, 'id'>): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  assertRequirementIds(kit, input.requirement_ids);
  const id = allocId(meta, 'f');
  kit.flashcards.push({ id, ...input });
  meta.items[id] = {
    origin: 'manual',
    pinned: false,
    gen: meta.gens.flashcards ?? 1,
    updatedAt: now(),
  };
  return { kit, meta };
}

export function deleteItem(b: Builder, id: string): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const qi = kit.questions.findIndex((x) => x.id === id);
  const fi = kit.flashcards.findIndex((x) => x.id === id);
  if (qi < 0 && fi < 0) throw new BuilderError('NOT_FOUND', `no item ${id}`);
  if (qi >= 0) kit.questions.splice(qi, 1);
  if (fi >= 0) kit.flashcards.splice(fi, 1);
  delete meta.items[id];
  for (const c of QUESTION_CATEGORIES)
    meta.order[c] = (meta.order[c] ?? []).filter((x) => x !== id);
  return qi >= 0 ? recompute({ kit, meta }) : { kit, meta };
}

/** New order for one category: must be a permutation of the questions currently in it. */
export function reorderQuestions(b: Builder, category: QuestionCategory, ids: string[]): Builder {
  const meta = clone(b.meta);
  const current = b.kit.questions.filter((q) => q.category === category).map((q) => q.id);
  if (
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !current.includes(id))
  ) {
    throw new BuilderError('BAD_ORDER', `order must be a permutation of ${current.join(', ')}`);
  }
  meta.order[category] = ids;
  return recompute({ kit: b.kit, meta });
}

export function moveQuestion(
  b: Builder,
  id: string,
  to: QuestionCategory,
  index?: number,
): Builder {
  if (!QUESTION_CATEGORIES.includes(to))
    throw new BuilderError('BAD_CATEGORY', `no category ${to}`);
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const q = kit.questions.find((x) => x.id === id);
  if (!q) throw new BuilderError('NOT_FOUND', `no question ${id}`);
  for (const c of QUESTION_CATEGORIES)
    meta.order[c] = (meta.order[c] ?? []).filter((x) => x !== id);
  q.category = to;
  const list = meta.order[to] ?? [];
  list.splice(index ?? list.length, 0, id);
  meta.order[to] = list;
  meta.items[id] = {
    ...(meta.items[id] ?? { origin: 'generated', pinned: false, gen: 1 }),
    updatedAt: now(),
  };
  return recompute({ kit, meta });
}

export function setPinned(b: Builder, id: string, pinned: boolean): Builder {
  const meta = clone(b.meta);
  if (!meta.items[id]) throw new BuilderError('NOT_FOUND', `no item ${id}`);
  meta.items[id] = { ...meta.items[id], pinned, updatedAt: now() };
  return { kit: b.kit, meta };
}

/**
 * The merge rule (ADR 0008): regenerating a category bumps its gen and replaces only questions
 * that are generated, unpinned and from an older gen. Edited, manual and pinned questions keep
 * their position; new questions are appended.
 */
export function mergeRegeneratedQuestions(
  b: Builder,
  category: QuestionCategory,
  fresh: Omit<Question, 'id'>[],
): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const key = `questions:${category}` as const;
  const gen = (meta.gens[key] ?? 1) + 1;
  meta.gens[key] = gen;

  const replaceable = (id: string) => {
    const m = meta.items[id];
    return !m || (m.origin === 'generated' && !m.pinned && m.gen < gen);
  };
  const removed = kit.questions
    .filter((q) => q.category === category && replaceable(q.id))
    .map((q) => q.id);
  kit.questions = kit.questions.filter((q) => !removed.includes(q.id));
  for (const id of removed) delete meta.items[id];
  meta.order[category] = (meta.order[category] ?? []).filter((id) => !removed.includes(id));

  const known = new Set(kit.role.requirements.map((r) => r.id));
  for (const q of fresh) {
    const id = allocId(meta, 'q');
    kit.questions.push({
      id,
      ...q,
      category,
      requirement_ids: q.requirement_ids.filter((r) => known.has(r)),
    });
    meta.items[id] = { origin: 'generated', pinned: false, gen, updatedAt: now() };
    meta.order[category] = [...(meta.order[category] ?? []), id];
  }
  return recompute({ kit, meta });
}

export function mergeRegeneratedFlashcards(b: Builder, fresh: Omit<Flashcard, 'id'>[]): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  const gen = (meta.gens.flashcards ?? 1) + 1;
  meta.gens.flashcards = gen;
  const keep = kit.flashcards.filter((f) => {
    const m = meta.items[f.id];
    return m && (m.origin !== 'generated' || m.pinned);
  });
  for (const f of kit.flashcards) if (!keep.includes(f)) delete meta.items[f.id];
  kit.flashcards = keep;
  const known = new Set(kit.role.requirements.map((r) => r.id));
  for (const f of fresh) {
    const id = allocId(meta, 'f');
    kit.flashcards.push({
      id,
      ...f,
      requirement_ids: f.requirement_ids.filter((r) => known.has(r)),
    });
    meta.items[id] = { origin: 'generated', pinned: false, gen, updatedAt: now() };
  }
  return { kit, meta };
}

export function replaceBrief(b: Builder, brief: Kit['company_brief']): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  kit.company_brief = brief;
  meta.gens.company_brief = (meta.gens.company_brief ?? 1) + 1;
  meta.sections.company_brief.origin = 'generated';
  return { kit, meta };
}

/** Schedule regeneration is deterministic; optionally with a different number of days. */
export function rebuildSchedule(b: Builder, days?: number): Builder {
  const kit = clone(b.kit);
  const meta = clone(b.meta);
  kit.schedule = buildSchedule(
    days ?? kit.schedule.days_available,
    kit.role.requirements,
    kit.questions,
  );
  meta.gens.schedule = (meta.gens.schedule ?? 1) + 1;
  return { kit, meta };
}
