# Feature: API — auth, kits, runner

> Routes: `POST /auth/register` `POST /auth/login` `POST /auth/logout` `GET /auth/me` ·
> `GET /kits` `POST /kits` `POST /kits/bulk` `GET /kits/:id` `POST /kits/:id/retry` `DELETE /kits/:id` · `GET /health`
> Source: `apps/api/src` — `config` · `db` · `models/{user,session,kit}` · `middleware/{auth,validate,errors}` ·
> `services/{auth,kits,runner}` · `routes/{auth,kits}` · `app` (factory) · `server` (boot)
> Decisions: ADR 0001, 0002, 0008 (proposed)

**Every kit belongs to one user and is only ever queried with that user's id.** There is no admin path.

## Signing in

Email + password (min 8 chars). Passwords are hashed with `scrypt` from `node:crypto` (no native
dependency). A session is a random token stored **server-side** in Mongo with a TTL index; the browser
holds it in an `httpOnly` cookie `sid`. Logout deletes the session row, so a stolen cookie dies with
it; an expired session is a 401 `UNAUTHENTICATED` like any signed-out request. Unknown email and wrong
password return the identical 401 body (no account enumeration). Web (Vercel) and API (Railway) are
different sites, so in production the cookie is `SameSite=None; Secure`; locally it is `Lax`.

## Creating a kit

`POST /kits { jd, company_url, days }` → 202 with the kit document in `queued` state, or **200 with
`reused: true`** when the same description + company + days (whitespace/case-insensitive fingerprint)
was submitted in the last 24 h and did not fail — the Section 10 duplicate case. `POST /kits/bulk`
takes `{ cases: [...] }` (≤20) for preparing several roles at once.

## Watching it run

The document holds the pipeline `state` (ADR 0002) and is updated **after every step**. The web app
polls `GET /kits/:id` (~2 s) and renders `state.steps[]` — name, status (`ok` / `skipped` / `failed`),
ms, and human-readable notes such as `hiring page: …` or `no public discussion found`. When
`status` is `done`, `kit` holds the validated Appendix A object.

## The runner

`services/runner.ts` is an in-process queue (concurrency from `RUNNER_CONCURRENCY`, default 1 —
free-tier LLM limits). For each iteration it takes an **atomic lock** on the document
(`findOneAndUpdate` where `runLock` is null or older than 5 min), runs exactly one `advance()`,
persists the new state, clears the lock. Consequences:

- a second trigger cannot run the same step twice (the lock is held);
- if the process dies mid-step, the next boot's `recover()` re-queues every `queued`/`running` kit
  and takes over stale locks — the run resumes from the last completed step, nothing is redone;
- a `failed` kit can be retried with `POST /kits/:id/retry`: the failed step record is dropped and
  the run continues from there with the artifacts of earlier steps intact.

## Errors

Always `{ error: { code, message, issues? } }`: `VALIDATION` (400, with zod issue paths),
`UNAUTHENTICATED` (401), `AUTH` (401/409), `NOT_FOUND` (404 — also for another user's kit, so ids
leak nothing), `NOT_FAILED` (409 on retrying a kit that did not fail), `INTERNAL` (500, no stack).

## Local development

```bash
docker compose up -d mongo      # mongo:8.2 (8.0 cannot start on Linux kernel 6.19+)
npm run dev -w apps/api         # http://localhost:4000
npm test -w apps/api            # integration tests against the same Mongo, fake LLM, fixture sites
```
