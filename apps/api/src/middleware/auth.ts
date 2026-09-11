import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { resolveSession } from '../services/auth.js';

export interface AuthedUser {
  id: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
    sessionToken?: string;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return undefined; // a malformed cookie is simply not a session
      }
    }
  }
  return undefined;
}

/** Attaches req.user when a valid, unexpired session cookie is present; never rejects by itself. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req.headers.cookie, config.cookie.name);
  if (token) {
    const user = await resolveSession(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

/** Protected routes: a signed-out or expired visitor gets a structured 401 (Section 1). */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
    return;
  }
  next();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    maxAge: config.cookie.maxAgeMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    path: '/',
  });
}
