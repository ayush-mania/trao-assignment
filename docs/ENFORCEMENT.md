# Enforcement

Every rule the brief scores appears here with **how it is held**. A rule nobody can violate
mechanically will be violated; the honest thing is to say which ones those are.

Three states:

- **Code** — the pipeline cannot produce the violation (a filter, an assertion, a validator).
- **Test** — a named test fails if it regresses (`npm test`).
- **Review** — a person has to notice. Every line here is a known gap.

## Code

| Rule (brief)                                                                                         | Held by                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Kit field names and enums exactly Appendix A; unknown keys stripped                                  | `validation/kit-schema.ts` (zod), run before persist/emit                 |
| Every id referenced exists; ids unique; schedule has exactly N days numbered 1..N                    | `validation/validate-kit.ts` `checkIntegrity`                             |
| `coverage` block matches the questions (cannot claim coverage it lacks)                              | `checkIntegrity` recomputes and compares                                  |
| A requirement not quoted from the JD cannot exist                                                    | `extraction/extract-requirements.ts` evidence gate                        |
| Logistics (start date, remote, salary) are not requirements                                          | anchored `LOGISTICS` regex                                                |
| must/nice comes from the posting's wording, not the model                                            | `extraction/priority.ts` overrides the model's value                      |
| Ids assigned by code, never reused after deletion                                                    | `validation/ids.ts` `nextId`; schema regex per list                       |
| Every question's `requirement_ids` refer to real requirements                                        | filtered against known ids in `generation/questions.ts` and `coverage.ts` |
| Every must-have with a question is scheduled; integer minutes; no empty day                          | `schedule/allocate.ts` `assertValid` throws                               |
| Coverage loop bounded (≤3 passes, stops on no progress)                                              | `coverage/coverage.ts`                                                    |
| Private/loopback/link-local targets refused in production, on every redirect hop, and for robots.txt | `retrieval/url-policy.ts`, `fetch-page.ts`                                |
| Fetched pages: type and size limits, timeout, redirect cap; never throws                             | `retrieval/fetch-page.ts`                                                 |
| Untrusted text is data, not instructions                                                             | `llm/prompting.ts` `wrapUntrusted` + preamble in every system prompt      |
| Model output caps (lengths, counts)                                                                  | `.max()` on every proposed schema                                         |
| Company name never a hostname; no discussion search without a name                                   | `generation/research-context.ts`, `pipeline/run.ts`                       |
| Research failures never fail a run; only INVALID_INPUT / LLM_UNAVAILABLE / KIT_INVALID do            | `pipeline/run.ts` `classify`                                              |
| Batch continues after a failed case; one entry per case                                              | `scripts/evaluate.ts` per-case try/catch                                  |
| Secrets never committed                                                                              | `.gitignore` (`.env*` except `.env.example`, `.mcp.json`)                 |
| Provider rate limits respected; long Retry-After → failover, not stall                               | `llm/client.ts` per-provider limiter, cooldown                            |

## Test

| Rule                                                                                                                                      | Test                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Appendix A shape violations each rejected with a path                                                                                     | `validate-kit.test.ts` "rejects invalid %s" table     |
| Thin kit (no requirements/questions) is valid                                                                                             | `validate-kit.test.ts` "allows an empty kit skeleton" |
| Exactly N days for 1, 2, 5, 60; every must-have present; integer minutes ≥30                                                              | `allocate.test.ts`                                    |
| Hard/must material lands earlier; review days reuse valid ids                                                                             | `allocate.test.ts`                                    |
| Gap detection; second pass closes a must gap; no-progress stop; 3-pass cap; nice gaps not chased                                          | `coverage.test.ts`                                    |
| Invented requirement dropped; "bonus points for" → nice; "5 plus years" → must; nice heading beats "Strong"; list occurrence beats intro  | `extraction.test.ts`                                  |
| Two-line JD → thin, not padded; empty list accepted                                                                                       | `extraction.test.ts`                                  |
| SSRF: localhost, 127/8, ::1, 169.254, hex v4-mapped, public host resolving private, 302 to private                                        | `retrieval.test.ts`                                   |
| robots.txt blocks a page the ranker wants; redirected robots ignored                                                                      | `crawl.test.ts`, `retrieval.test.ts`                  |
| Hiring page found at an unpredictable path; no-hiring site reported; dead host unreachable; maxPages counts failures                      | `crawl.test.ts`                                       |
| Discussion: filtered to company+interview, deduped, failing source skipped, unknown company → nothing                                     | `public-discussion.test.ts`                           |
| Brief makes no call and cites nothing when nothing was retrieved                                                                          | `generation.test.ts`                                  |
| One call per category with distinct prompts; hiring signals change the plan; negation ignored                                             | `generation.test.ts`                                  |
| Retry honours Retry-After; backoff; cooldown failover; non-retryable fails over; JSON repair once                                         | `client.test.ts`                                      |
| Limiter never hangs on NaN or oversized request                                                                                           | `client.test.ts`                                      |
| Gemini per-model config (2.x/3.x/gemma)                                                                                                   | `client.test.ts`                                      |
| End-to-end: fixture site → valid kit; unreachable → honest kit; LLM outage → LLM_UNAVAILABLE; resume skips done steps; bad input rejected | `run.test.ts`                                         |
| Clean-clone install, format, lint, typecheck, test, build                                                                                 | `.github/workflows/ci.yml`                            |

## Review

| Rule                                                                               | Why nothing holds it yet                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Question quality (specific to the role, not generic filler)                        | judgement; spot-checked by reading kits after real runs                                                       |
| Brief never states something the documents do not                                  | prompt rule + "no research → no call"; a hallucination inside a document-grounded call is not machine-checked |
| Five cases under 15 minutes in Trao's environment                                  | measured ~135 s locally; their network and quotas may differ                                                  |
| DNS rebinding between policy check and connection                                  | not mitigated (README Known limitations)                                                                      |
| Builder preserves edits across regeneration                                        | not built yet (TRAO-19/21) — will move to Code/Test                                                           |
| Commit messages follow `feat/doc/hygeine/bugfix:` and contain no banned characters | convention only                                                                                               |
