// Every request body is validated with zod before a handler sees it (Section 13).
import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION',
          message: 'Invalid request',
          issues: r.error.issues
            .slice(0, 10)
            .map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
      return;
    }
    req.body = r.data;
    next();
  };
}
