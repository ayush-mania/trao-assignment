import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createOrReuseKit,
  deleteKit,
  getKit,
  listKits,
  MAX_DAYS,
  retryKit,
} from '../services/kits.js';
import type { Runner } from '../services/runner.js';

const kitInput = z.object({
  jd: z.string().trim().min(1).max(50_000),
  company_url: z.string().trim().min(1).max(2_000),
  days: z.number().int().min(1).max(MAX_DAYS),
});

export function kitsRouter(runner: Runner): Router {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res, next) => {
    try {
      res.json({ kits: await listKits(req.user!.id) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/', validateBody(kitInput), async (req, res, next) => {
    try {
      const { kit, reused } = await createOrReuseKit(req.user!.id, req.body);
      if (!reused) runner.enqueue(kit._id.toString());
      res.status(reused ? 200 : 202).json({ kit, reused });
    } catch (e) {
      next(e);
    }
  });

  // Several roles at once (Section 2): an array of the same shape; each becomes its own kit.
  r.post(
    '/bulk',
    validateBody(z.object({ cases: z.array(kitInput).min(1).max(20) })),
    async (req, res, next) => {
      try {
        const results = [];
        for (const c of req.body.cases) {
          const { kit, reused } = await createOrReuseKit(req.user!.id, c);
          if (!reused) runner.enqueue(kit._id.toString());
          results.push({ id: kit._id.toString(), reused });
        }
        res.status(202).json({ kits: results });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get('/:id', async (req, res, next) => {
    try {
      res.json({ kit: await getKit(req.user!.id, req.params.id) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/:id/retry', async (req, res, next) => {
    try {
      const kit = await retryKit(req.user!.id, req.params.id);
      runner.enqueue(kit._id.toString());
      res.status(202).json({ kit });
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      await deleteKit(req.user!.id, req.params.id);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
