// Builder operations on a stored kit: load { kit, meta }, apply a pure core edit, validate, persist.
// Regeneration re-runs ONE section's generator with the persisted research, then merges (ADR 0008).
import {
  addFlashcard,
  addQuestion,
  BuilderError,
  deleteItem,
  editBrief,
  editFlashcard,
  editQuestion,
  generateCompanyBrief,
  generateFlashcards,
  generateQuestionsForCategory,
  initMeta,
  mergeRegeneratedFlashcards,
  mergeRegeneratedQuestions,
  moveQuestion,
  planCategories,
  QUESTION_CATEGORIES,
  rebuildSchedule,
  reorderQuestions,
  replaceBrief,
  setPinned,
  validateKit,
  type Builder,
  type Flashcard,
  type FlashcardPatch,
  type Kit,
  type KitMeta,
  type LlmClient,
  type Question,
  type QuestionCategory,
  type QuestionGenInput,
  type QuestionPatch,
  type ResearchContext,
  type RunState,
} from '@trao/core';
import { HttpError } from '../middleware/errors.js';
import { KitModel } from '../models/kit.js';
import { toObjectId } from './kits.js';

export type RegenerateSection =
  'company_brief' | 'schedule' | 'flashcards' | `questions:${QuestionCategory}`;

export const REGENERATE_SECTIONS: RegenerateSection[] = [
  'company_brief',
  'schedule',
  'flashcards',
  ...QUESTION_CATEGORIES.map((c) => `questions:${c}` as const),
];

async function load(userId: string, id: string): Promise<{ b: Builder; state: RunState }> {
  const doc = await KitModel.findOne({ _id: toObjectId(id), userId }).lean();
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
  if (doc.status !== 'done' || !doc.kit)
    throw new HttpError(409, 'NOT_READY', 'The kit is not finished yet');
  const kit = doc.kit as Kit;
  const meta = (doc.meta && (doc.meta as KitMeta).counters ? doc.meta : initMeta(kit)) as KitMeta;
  return { b: { kit, meta }, state: doc.state as RunState };
}

async function persist(userId: string, id: string, b: Builder): Promise<Builder> {
  const v = validateKit(b.kit);
  if (!v.ok) {
    throw new HttpError(
      422,
      'KIT_INVALID',
      `edit would make the kit invalid: ${v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    );
  }
  await KitModel.updateOne({ _id: toObjectId(id), userId }, { $set: { kit: v.kit, meta: b.meta } });
  return { kit: v.kit, meta: b.meta };
}

function run(fn: () => Builder): Builder {
  try {
    return fn();
  } catch (err) {
    if (err instanceof BuilderError) {
      throw new HttpError(err.code === 'NOT_FOUND' ? 404 : 400, err.code, err.message);
    }
    throw err;
  }
}

export async function applyEdit(
  userId: string,
  id: string,
  op:
    | { type: 'editQuestion'; itemId: string; patch: QuestionPatch }
    | { type: 'editFlashcard'; itemId: string; patch: FlashcardPatch }
    | { type: 'editBrief'; patch: { summary?: string; what_they_do?: string } }
    | { type: 'addQuestion'; question: Omit<Question, 'id'>; index?: number }
    | { type: 'addFlashcard'; flashcard: Omit<Flashcard, 'id'> }
    | { type: 'delete'; itemId: string }
    | { type: 'reorder'; category: QuestionCategory; ids: string[] }
    | { type: 'move'; itemId: string; to: QuestionCategory; index?: number }
    | { type: 'pin'; itemId: string; pinned: boolean },
): Promise<Builder> {
  const { b } = await load(userId, id);
  const next = run(() => {
    switch (op.type) {
      case 'editQuestion':
        return editQuestion(b, op.itemId, op.patch);
      case 'editFlashcard':
        return editFlashcard(b, op.itemId, op.patch);
      case 'editBrief':
        return editBrief(b, op.patch);
      case 'addQuestion':
        return addQuestion(b, op.question, op.index);
      case 'addFlashcard':
        return addFlashcard(b, op.flashcard);
      case 'delete':
        return deleteItem(b, op.itemId);
      case 'reorder':
        return reorderQuestions(b, op.category, op.ids);
      case 'move':
        return moveQuestion(b, op.itemId, op.to, op.index);
      case 'pin':
        return setPinned(b, op.itemId, op.pinned);
    }
  });
  return persist(userId, id, next);
}

/** Regenerate one section; everything the user edited, added or pinned elsewhere is untouched. */
export async function regenerate(
  userId: string,
  id: string,
  section: RegenerateSection,
  llm: LlmClient,
  opts: { days?: number } = {},
): Promise<Builder> {
  const { b, state } = await load(userId, id);
  const research = state.artifacts.research as ResearchContext | undefined;
  const role = state.artifacts.role;
  if (!research || !role)
    throw new HttpError(409, 'NOT_READY', 'Research artifacts are missing; run the kit again');

  let next: Builder;
  if (section === 'schedule') {
    next = run(() => rebuildSchedule(b, opts.days));
  } else if (section === 'company_brief') {
    const r = await generateCompanyBrief(research, llm);
    next = replaceBrief(b, r.brief);
  } else if (section === 'flashcards') {
    const cards = await generateFlashcards(
      b.kit.role.requirements,
      { title: b.kit.role.title },
      llm,
    );
    next = mergeRegeneratedFlashcards(
      b,
      cards.map(({ id: _id, ...rest }) => rest),
    );
  } else {
    const category = section.slice('questions:'.length) as QuestionCategory;
    const input: QuestionGenInput = {
      role: {
        title: b.kit.role.title,
        seniority: b.kit.role.seniority,
        responsibilities: b.kit.role.responsibilities,
      },
      requirements: b.kit.role.requirements,
      research,
      hiringProcess: state.artifacts.hiringProcess ?? '',
    };
    const plan = planCategories(input).find((p) => p.category === category) ?? {
      category,
      requirements: b.kit.role.requirements,
      count: 4,
    };
    const fresh = await generateQuestionsForCategory(plan, input, llm);
    next = mergeRegeneratedQuestions(b, category, fresh);
  }
  return persist(userId, id, next);
}
