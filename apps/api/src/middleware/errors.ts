// Structured errors for the interface (Section 13): { error: { code, message } }, never a stack trace.
import type { NextFunction, Request, Response } from 'express';
import { LlmError } from '@trao/core';
import { AuthError } from '../services/auth.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: { code: 'AUTH', message: err.message } });
    return;
  }
  if (err instanceof LlmError) {
    res.status(503).json({
      error: {
        code: 'LLM_UNAVAILABLE',
        message: 'The model is unavailable right now; try again shortly',
      },
    });
    return;
  }
  // body-parser errors (413 too large, 415 unsupported, 400 malformed) carry a status; keep it.
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    !(err instanceof SyntaxError)
  ) {
    res.status(status).json({
      error: {
        code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: (err as Error).message,
      },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed JSON body' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route' } });
}
