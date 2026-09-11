import { rateCard, type PracticeState } from '@trao/core';
import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { KitModel } from '../models/kit.js';
import { toObjectId } from '../services/kits.js';

const param = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

// mergeParams gives us :id from the parent mount; typed loosely because Express 5's ParamsDictionary is {}.
export const practiceRouter = Router({ mergeParams: true });
practiceRouter.use(requireUser);

practiceRouter.get('/', async (req, res, next) => {
  try {
    const doc = await KitModel.findOne({
      _id: toObjectId(param((req.params as { id?: string | string[] }).id)),
      userId: req.user!.id,
    })
      .select('practice')
      .lean();
    if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
    res.json({ practice: (doc.practice ?? {}) as PracticeState });
  } catch (e) {
    next(e);
  }
});

/** One rating per call: small, idempotent-enough, and safe to fire optimistically from the UI. */
practiceRouter.post(
  '/rate',
  validateBody(
    z.object({
      cardId: z.string().regex(/^f\d+$/),
      confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
  ),
  async (req, res, next) => {
    try {
      const doc = await KitModel.findOne({
        _id: toObjectId(param((req.params as { id?: string | string[] }).id)),
        userId: req.user!.id,
      }).select('practice kit');
      if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
      const cards = ((doc.kit as { flashcards?: { id: string }[] } | null)?.flashcards ?? []).map(
        (c) => c.id,
      );
      if (!cards.includes(req.body.cardId))
        throw new HttpError(404, 'NOT_FOUND', 'No such flashcard in this kit');
      const practice = rateCard(
        (doc.practice ?? {}) as PracticeState,
        req.body.cardId,
        req.body.confidence,
      );
      await KitModel.updateOne({ _id: doc._id }, { $set: { practice } });
      res.json({ practice });
    } catch (e) {
      next(e);
    }
  },
);

practiceRouter.delete('/', async (req, res, next) => {
  try {
    const r = await KitModel.updateOne(
      {
        _id: toObjectId(param((req.params as { id?: string | string[] }).id)),
        userId: req.user!.id,
      },
      { $set: { practice: {} } },
    );
    if (r.matchedCount === 0) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
