# 0002 — The pipeline is a resumable step state machine

## Status

Accepted, 2026-09-11.

## Decision

`RunState` is plain JSON: `{ input, step, status, steps[], artifacts, error }`. `advance(state, deps)`
runs exactly one of ten named steps and returns the new state. `runToCompletion()` loops it. The
API persists state after every step and can resume; the CLI loops in-process.

Research steps (`crawl_company`, `search_discussion`, `company_brief`) never fail a run: an
unreachable site, a missing hiring page or an empty discussion search becomes a recorded gap and a
`skipped` step. Only three things fail a run, with Appendix B codes: `INVALID_INPUT`,
`LLM_UNAVAILABLE` (every provider exhausted) and `KIT_INVALID` (our assembled kit failed our own
validator — a bug, reported rather than hidden).

## Why

Section 13 asks what happens at ninety seconds, halfway through, or on a double trigger. Persisted
per-step state answers all three: progress is visible, a failed step can be retried from where it
stopped, and a fingerprint (`sha256(jd, url, days)`) makes the second trigger return the first run.
The FAQ says a partial research is still `ok` — so research cannot be a failure path.

## Rejected

One long function with try/catch (no progress, no resume, no per-step timing for the UI).

## Revisit when

Steps need to run in parallel (e.g. crawl and extraction concurrently) — the state shape allows it.
