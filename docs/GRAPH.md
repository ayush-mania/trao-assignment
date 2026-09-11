<!--
  The single current-state picture of this system. Graph form where possible, tables otherwise.
  Read this first after a session restart or context compaction; Notion holds task status, this
  holds how the system is shaped. Update it in the same change that changes the shape.
-->

# System graph

Status and task board: Notion project "Trao" (see `.claude/hooks/notion-session-start.sh`).
Decisions: `docs/decisions/`. What enforces what: `docs/ENFORCEMENT.md`. Per-feature flows: `docs/features/`.

## 1 · Modules

```mermaid
flowchart LR
  subgraph core["packages/core — pure TypeScript, no HTTP framework, no DB"]
    validation["validation/<br/>kit-schema (Appendix A)<br/>validate-kit (integrity)<br/>ids (next free id)"]
    llm["llm/<br/>client (limits, backoff, cooldown failover, JSON repair)<br/>gemini · groq providers<br/>lenient (accept model drift)<br/>prompting (untrusted boundary)"]
    retrieval["retrieval/<br/>url-policy (SSRF)<br/>fetch-page (robots, caps)<br/>clean-page (HTML→text+links)<br/>rank-links · crawl-site<br/>public-discussion (HN, Reddit)"]
    extraction["extraction/<br/>extract-requirements (evidence gate)<br/>priority (must/nice from wording)"]
    generation["generation/<br/>research-context (name, signals)<br/>company-brief · questions · flashcards"]
    coverage["coverage/<br/>findGaps (set difference)<br/>closeCoverage (≤3 passes)"]
    schedule["schedule/<br/>allocate (deterministic)"]
    pipeline["pipeline/<br/>state (RunState, STEPS)<br/>run (advance, runToCompletion, fingerprint)"]
    builder["builder/<br/>meta (origin, pinned, gen, order, counters)<br/>edits (pure ops + merge rule)"]
  end
  cli["scripts/evaluate.ts<br/>npm run evaluate"] --> pipeline
  api["apps/api (Express 5 + Mongoose)<br/>auth · kits · runner<br/>docs/features/api.md"] --> pipeline
  web["apps/web (Next 16 + shadcn)<br/>builder · practice — TRAO-20+"] --> api
  fixtures["fixtures/sites + scripts/serve-fixtures.ts<br/>localhost:8099 acme · nohire"] -.tests & batch demo.-> retrieval
  pipeline --> extraction & retrieval & generation & coverage & schedule & validation
  builder --> coverage & schedule & validation
  api --> builder
  extraction & generation & coverage --> llm
```

Dependency rule: arrows only point inward to `core`; `core` never imports from `apps/` or `scripts/`.
`apps/web` imports **types only** from core (core's runtime needs Node modules).
`testing/` inside core (fake LLM, fixture fetch, valid kit) is test-only and excluded from the build.

## 2 · The run: one state, ten steps

```mermaid
stateDiagram-v2
  [*] --> validate_input
  validate_input --> extract_requirements: jd non-empty, ≤50k chars, 1 ≤ days ≤ 365
  validate_input --> failed: INVALID_INPUT
  extract_requirements --> crawl_company
  extract_requirements --> failed: LLM_UNAVAILABLE (all providers exhausted)
  crawl_company --> search_discussion: homepage ok, or skipped (unreachable → gap recorded)
  search_discussion --> company_brief: snippets, or skipped (none / name unknown)
  company_brief --> generate_questions: brief from documents, or skipped (no research → honest empty brief)
  generate_questions --> close_coverage: one call per category
  close_coverage --> flashcards: gaps closed or reported (≤3 passes)
  flashcards --> build_schedule
  build_schedule --> assemble_and_validate: exactly N days
  assemble_and_validate --> done: validateKit ok
  assemble_and_validate --> failed: KIT_INVALID (our bug, reported not hidden)
```

- `advance(state, deps)` runs exactly one step and returns new plain-JSON state (persistable, resumable).
- `runToCompletion()` loops it (CLI); the API `Runner` calls `advance()` one step at a time with an atomic per-kit lock and persists after each (`docs/features/api.md`).
- Research steps never fail the run; they record `gaps[]` and a `skipped` step status.
- `steps[]` carries `{name, status, ms, notes[]}` — the progress UI and the batch log read this.

## 3 · What each step consumes and produces

| Step                  | Reads                         | Writes to `artifacts`                                                                    | LLM calls           |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| validate_input        | input                         | —                                                                                        | 0                   |
| extract_requirements  | jd                            | `role` (title, seniority, requirements `r1…` with kind+priority, rejected[], thin, note) | 1 (+1 repair max)   |
| crawl_company         | company_url                   | `research` (homepage, aboutPage, hiringPage, gaps), `pagesUsed`                          | 0                   |
| search_discussion     | research.companyName          | `research.discussion` (≤8 snippets)                                                      | 0                   |
| company_brief         | research                      | `brief` (summary, what_they_do, sources), `hiringProcess`                                | 0 or 1              |
| generate_questions    | role, research, hiringProcess | `questions` `q1…`                                                                        | 1 per category (≤4) |
| close_coverage        | requirements, questions       | `questions` (+gap fillers), `coverage` {passes, uncovered, log}                          | 0–4                 |
| flashcards            | requirements                  | `flashcards` `f1…`                                                                       | 0 or 1              |
| build_schedule        | days, requirements, questions | `schedule`                                                                               | 0                   |
| assemble_and_validate | all                           | `kit` (Appendix A, validated)                                                            | 0                   |

Typical kit: 7–9 LLM calls. Five fixture cases: ~135 s on the current provider chain.

## 4 · Decisions the code makes that the model is not allowed to

| Fact                                | Decided by                                             | Where                                |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Whether a requirement exists        | evidence must quote the JD (`indexOfLoose`)            | `extraction/extract-requirements.ts` |
| must vs nice                        | sentence wording → nearest heading → default must      | `extraction/priority.ts`             |
| Logistics are not requirements      | anchored regex on text/evidence                        | `extraction/extract-requirements.ts` |
| Every id (`r/q/f<n>`)               | assigned in code; prefix bound per list in schema      | `validation/ids.ts`, `kit-schema.ts` |
| Which question categories, how many | `planCategories` from kinds, seniority, hiring signals | `generation/questions.ts`            |
| Coverage gaps                       | set difference                                         | `coverage/coverage.ts`               |
| Day allocation, minutes             | arithmetic                                             | `schedule/allocate.ts`               |
| Company name                        | JD, else site title, never a hostname                  | `generation/research-context.ts`     |
| Whether to search discussion        | only with a known company name                         | `pipeline/run.ts`                    |

## 5 · LLM provider chain (measured 2026-09-11)

```mermaid
flowchart LR
  call["completeJson(schema)"] --> L1["gemini:gemini-3.5-flash-lite<br/>15 RPM"]
  L1 -- "429 Retry-After ≥10s → cooldown<br/>or 4 attempts spent / non-retryable" --> L2["gemini:gemma-4-26b-a4b-it<br/>≥20 RPM, no thinking/JSON-mode config"]
  L2 -- same --> L3["groq:openai/gpt-oss-120b<br/>30 RPM, 8k TPM, 1k RPD"]
  L3 -- all exhausted --> E["LlmError → step fails → LLM_UNAVAILABLE"]
```

Each provider has its own RPM/TPM bucket (`.env`). Output parsed via `extractJson` → lenient preprocess
→ zod; one repair round-trip, then error. Untrusted text always inside `wrapUntrusted()` blocks.

## 6 · Where a fact lives

| Fact                             | Lives in                                        | Not in                                      |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Appendix A shape                 | `validation/kit-schema.ts`                      | README (describes it), prompts (ask for it) |
| Error codes for Appendix B       | `pipeline/state.ts` `RunErrorCode`              | CLI (passes through)                        |
| Free-tier model limits           | `.env.example` defaults, README table, ADR 0003 | code constants (only fallbacks)             |
| Task status / what is next       | Notion board                                    | repo                                        |
| Why a decision was taken         | `docs/decisions/`                               | Notion (one-liners linking here)            |
| Which rule is held by which test | `docs/ENFORCEMENT.md`                           | —                                           |

## 7 · Open questions

- **Stale `dist` trap** — `@trao/core` exports `dist/` for `import`; vitest in `apps/api` aliases the package to `src/`
  and `tsx --conditions=source` does the same in dev, otherwise a stale build shadows the source (two `LlmError`
  classes). Production builds core first (`npm run build` at the root).
- **Edit / pinned state model (TRAO-19)** — per-item `origin` + `pinned` + section `gen`, kept _alongside_ the
  Appendix A kit (not inside it) so batch output stays pure. To be locked when the API lands.
- **Practice ordering (TRAO-22)** — confidence-weighted sort with recency tiebreak; proper SRS intervals rejected
  for a ≤60-day horizon.
- **Reddit** returns 403 to our bot user-agent; HN works. Leave honest, document.
- **Gemini flash-lite RPD** not yet observed (only RPM=15 seen). If a daily cap bites in grading, Gemma and Groq carry the run.
- **DNS rebinding** (URL policy resolves, fetch resolves again) — known limitation, not in this timebox.
