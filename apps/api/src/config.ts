// All environment access in one place. Missing required values fail fast at boot, not on first request.
import { loadDotEnv } from '@trao/core';
import { resolve } from 'node:path';

loadDotEnv(resolve(process.cwd(), '.env'));
loadDotEnv(resolve(process.cwd(), '..', '..', '.env')); // when started from apps/api

const isProd = process.env.NODE_ENV === 'production';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return v;
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required('MONGODB_URI'),
  sessionSecret: required('SESSION_SECRET'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  /** Web on Vercel and API on Railway are different sites: the cookie must be SameSite=None; Secure. */
  cookie: {
    name: 'sid',
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    secure: isProd,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  allowPrivateUrls: process.env.ALLOW_PRIVATE_URLS === 'true',
  runnerConcurrency: Number(process.env.RUNNER_CONCURRENCY ?? 1),
};
