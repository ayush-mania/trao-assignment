import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { clearSessionCookie, requireUser, setSessionCookie } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSession, destroySession, login, register } from '../services/auth.js';

const credentials = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export const authRouter = Router();

authRouter.post('/register', validateBody(credentials), async (req, res, next) => {
  try {
    const user = await register(req.body.email, req.body.password);
    setSessionCookie(res, await createSession(user.id, config.cookie.maxAgeMs));
    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', validateBody(credentials), async (req, res, next) => {
  try {
    const user = await login(req.body.email, req.body.password);
    setSessionCookie(res, await createSession(user.id, config.cookie.maxAgeMs));
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    if (req.sessionToken) await destroySession(req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireUser, (req, res) => {
  res.json({ user: req.user });
});
