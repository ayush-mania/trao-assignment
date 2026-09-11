# 0001 — Stack and repository layout

## Status

Accepted, 2026-09-11.

## Decision

npm-workspaces monorepo. `packages/core` holds the whole pipeline as pure TypeScript with no HTTP
framework and no database; `apps/api` (Express 5) and `scripts/evaluate.ts` both call the same
`runToCompletion()`. `apps/web` is Next.js 16 (App Router) + Tailwind 4 + shadcn/ui. MongoDB Atlas.
Web on Vercel, API on Railway. TypeScript everywhere. Dependencies at latest, with two holds:
TypeScript 6.x (typescript-eslint rejects 7.0) and ESLint 9.x (eslint-plugin-react breaks on 10).

## Why

Section 9 says the batch command must run "the same code your application uses, not a parallel
implementation". A shared package makes that structurally true rather than a promise. Railway keeps
a long-lived process, which the generation runner needs (a kit run is 90 s+ with rate limits);
Vercel functions are request-scoped and were rejected for the API for that reason.

## Rejected

- Vercel for the API (function timeout kills a run; no background worker).
- CLI calling the HTTP API (would need a running server and Mongo from a clean clone).
- TypeScript 7 / ESLint 10 (toolchain not ready; verified by hitting the failures).

## Revisit when

typescript-eslint supports TS 7 and eslint-plugin-react supports ESLint 10.
