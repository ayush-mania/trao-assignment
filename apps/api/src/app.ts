// The Express app, built from explicit dependencies so tests can inject a fake LLM and fixture fetch.
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { kitsRouter } from './routes/kits.js';
import type { Runner } from './services/runner.js';
import { builderRouter } from './routes/builder.js';
import { practiceRouter } from './routes/practice.js';
import type { LlmClient } from '@trao/core';

export function createApp(runner: Runner, llm: LlmClient): express.Express {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of us
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(attachUser);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/kits/:id/practice', practiceRouter);
  app.use('/kits/:id', builderRouter(llm));
  app.use('/kits', kitsRouter(runner));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
