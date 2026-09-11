import { Router } from 'express';
import { z } from 'zod';
import { QUESTION_CATEGORIES, type LlmClient } from '@trao/core';
import { requireUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  applyEdit,
  regenerate,
  REGENERATE_SECTIONS,
  type RegenerateSection,
} from '../services/builder.js';
import { MAX_DAYS } from '../services/kits.js';

const category = z.enum(QUESTION_CATEGORIES);
const reqIds = z.array(z.string().regex(/^r\d+$/)).max(20);

const questionPatch = z.object({
  prompt: z.string().trim().min(1).max(600).optional(),
  answer_outline: z.string().max(2000).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  requirement_ids: reqIds.optional(),
});
const flashcardPatch = z.object({
  front: z.string().trim().min(1).max(200).optional(),
  back: z.string().max(1000).optional(),
  requirement_ids: reqIds.optional(),
});

const param = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export function builderRouter(llm: LlmClient): Router {
  const r = Router({ mergeParams: true });
  r.use(requireUser);
  const wrap =
    (fn: (req: Parameters<Parameters<typeof r.patch>[1]>[0]) => Promise<unknown>) =>
    async (
      req: Parameters<Parameters<typeof r.patch>[1]>[0],
      res: Parameters<Parameters<typeof r.patch>[1]>[1],
      next: Parameters<Parameters<typeof r.patch>[1]>[2],
    ) => {
      try {
        res.json(await fn(req));
      } catch (e) {
        next(e);
      }
    };

  r.patch(
    '/questions/:itemId',
    validateBody(questionPatch),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'editQuestion',
        itemId: param(req.params.itemId),
        patch: req.body,
      }),
    ),
  );
  r.patch(
    '/flashcards/:itemId',
    validateBody(flashcardPatch),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'editFlashcard',
        itemId: param(req.params.itemId),
        patch: req.body,
      }),
    ),
  );
  r.patch(
    '/brief',
    validateBody(
      z.object({
        summary: z.string().max(4000).optional(),
        what_they_do: z.string().max(2000).optional(),
      }),
    ),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), { type: 'editBrief', patch: req.body }),
    ),
  );
  r.post(
    '/questions',
    validateBody(
      z.object({
        category,
        prompt: z.string().trim().min(1).max(600),
        answer_outline: z.string().max(2000).default(''),
        difficulty: z.number().int().min(1).max(3).default(2),
        requirement_ids: reqIds.default([]),
        index: z.number().int().min(0).optional(),
      }),
    ),
    wrap((req) => {
      const { index, ...question } = req.body;
      return applyEdit(req.user!.id, param(req.params.id), {
        type: 'addQuestion',
        question,
        index,
      });
    }),
  );
  r.post(
    '/flashcards',
    validateBody(
      z.object({
        front: z.string().trim().min(1).max(200),
        back: z.string().max(1000).default(''),
        requirement_ids: reqIds.default([]),
      }),
    ),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), { type: 'addFlashcard', flashcard: req.body }),
    ),
  );
  r.delete(
    '/items/:itemId',
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'delete',
        itemId: param(req.params.itemId),
      }),
    ),
  );
  r.put(
    '/order',
    validateBody(z.object({ category, ids: z.array(z.string()).max(200) })),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'reorder',
        category: req.body.category,
        ids: req.body.ids,
      }),
    ),
  );
  r.post(
    '/questions/:itemId/move',
    validateBody(z.object({ to: category, index: z.number().int().min(0).optional() })),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'move',
        itemId: param(req.params.itemId),
        to: req.body.to,
        index: req.body.index,
      }),
    ),
  );
  r.post(
    '/items/:itemId/pin',
    validateBody(z.object({ pinned: z.boolean() })),
    wrap((req) =>
      applyEdit(req.user!.id, param(req.params.id), {
        type: 'pin',
        itemId: param(req.params.itemId),
        pinned: req.body.pinned,
      }),
    ),
  );
  r.post(
    '/regenerate',
    validateBody(
      z.object({
        section: z.enum(REGENERATE_SECTIONS as [RegenerateSection, ...RegenerateSection[]]),
        days: z.number().int().min(1).max(MAX_DAYS).optional(),
      }),
    ),
    wrap((req) =>
      regenerate(req.user!.id, param(req.params.id), req.body.section, llm, {
        days: req.body.days,
      }),
    ),
  );
  return r;
}
