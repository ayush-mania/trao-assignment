# AI Interview Prep Kit

Turns a pasted job description + a company website into a personalised interview prep kit:
company brief, role breakdown, categorised question bank, flashcards and a day-by-day study
schedule — then lets you edit it and practise against it.

Built for Trao's full-stack engineering assessment.

## Stack

| Layer    | Choice                                                                         | Why                                                                                          |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui                                    | Preferred stack; shadcn gives accessible, keyboard-navigable primitives                      |
| Backend  | Node + Express (TypeScript)                                                    | Preferred stack; long-lived process on Railway runs the generation pipeline                  |
| Pipeline | `packages/core` — pure TypeScript, no HTTP/DB                                  | Same code path for the web app and the batch CLI (Section 9)                                 |
| Database | MongoDB Atlas                                                                  | Preferred stack                                                                              |
| LLM      | Gemini (`gemini-2.5-flash`) primary, Groq (`llama-3.3-70b-versatile`) fallback | Both free tiers; adapter fails over on sustained 429/5xx                                     |
| Scraping | `undici` fetch + `cheerio` + `robots-parser`                                   | No headless browser: careers/about pages are server-rendered; local fixture sites are static |

Everything is TypeScript. Dependencies are kept at latest, with two deliberate holds: TypeScript 6.x (typescript-eslint does not support 7.0 yet) and ESLint 9.x (eslint-plugin-react is not ESLint 10 compatible yet).

## Repository layout

```
packages/core   pipeline: retrieval / extraction / generation / coverage / schedule / validation / llm
apps/api        Express API: auth, kits, run state machine, persistence
apps/web        Next.js UI: builder, practice mode, schedule
scripts/        evaluate.ts — batch entry point
fixtures/       local company sites used by tests and the batch demo
```

## Setup

```bash
git clone https://github.com/ayush-mania/trao-assignment.git
cd trao-assignment
npm install
cp .env.example .env   # fill in the values; each one is documented inline
```

Run locally:

```bash
npm run dev -w apps/api   # http://localhost:4000
npm run dev -w apps/web   # http://localhost:3000
```

Checks: `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`.

## Batch entry point

```bash
npm run evaluate -- --input cases.json --output kits.json
```

Reads an array of `{ id, jd, company_url, days }` cases and writes the Appendix B file. Needs only
the LLM keys from `.env` (no database, no running server). _Status: not implemented yet._

## Deployment

Web → Vercel · API → Railway · DB → MongoDB Atlas. Environment variables are listed in
`.env.example` with what each is for.

## Kit structure and validation

The kit is exactly Appendix A (`packages/core/src/validation/kit-schema.ts`). `validateKit()` runs
before a kit is persisted or written by the batch command and checks two things:

- **shape** — zod schema with exact field names, enums (`kind`, `priority`, `category`), integer
  `difficulty` 1–3, integer `minutes`, ISO `researched_at`; ids are `r<n>`/`q<n>`/`f<n>` and are assigned by
  our code, never by the model, so the prefix is enforced per list; unknown keys are stripped so output is canonical;
- **integrity** — ids unique per list; every `requirement_ids` / `question_ids` / `uncovered_requirement_ids`
  entry refers to an existing item; `schedule.days` has exactly `days_available` entries numbered 1..N.

Failures are returned as `{ path, message }` pairs, never thrown. A thin kit (no requirements, no
questions, one general-prep day) is valid by design — reporting "little to extract" is a valid outcome.

## LLM layer

`packages/core/src/llm`. Providers (Gemini via REST, Groq via its OpenAI-compatible endpoint; no SDKs)
only turn a request into text or a typed error. `LlmClient` adds everything the free tiers force on us:

- self rate limiting (`LLM_RPM` / `LLM_TPM` sliding window) so we slow down before the provider does;
- retry with exponential backoff (2s, 4s, 8s … capped 60s) that honours `Retry-After` / Gemini's `retryDelay`;
- failover Gemini → Groq once a provider's attempt budget (4) is spent or it returns a non-retryable error;
- `completeJson(schema)`: JSON is extracted (fences, prose, trailing commas repaired) and validated with zod;
  one repair round-trip re-asks with the concrete error, a second failure is an error the step reports.

Untrusted text (pasted JD, crawled pages, search snippets) is always wrapped by `wrapUntrusted()` in a
labelled `<document>` block, and the system prompt states it is data, not instructions.

## Retrieval

`packages/core/src/retrieval`. `fetchPage()` is the only way anything in the pipeline touches the web:

- **URL policy** — `http(s)` only; credentials and fragments stripped; in production any host that is or
  resolves to a private, loopback, link-local or CGNAT address is refused (`ALLOW_PRIVATE_URLS=true`
  only for local batch runs against `localhost` fixture sites). Redirects are followed manually so
  every hop is re-checked — a 302 to `127.0.0.1` cannot get through.
- **robots.txt** — read once per origin and cached for the crawl; disallowed paths are skipped and
  reported as `blocked_by_robots`. Unreachable robots means no restrictions.
- **Caps** — 10s timeout, 5 redirects, `text/html` / `text/plain` only, 1.5 MB body (streamed and cut).
- **Never throws for a bad page** — every failure is a reason (`http_404`, `timeout`,
  `unsupported_content_type`, …) so a source is skipped and recorded, never fatal to the run.

`cleanPage()` turns HTML into readable text (scripts, styles, nav, header, footer, forms removed;
headings and paragraphs kept on their own lines) and returns the page's links resolved to absolute
URLs, relative ones included, which the crawler ranks.

## Architecture, retrieval, sequencing, edit state, schedule, decisions

_Filled in as each part lands._

## Known limitations

- **DNS rebinding.** The URL policy resolves a hostname and checks the addresses, then `fetch` resolves
  it again. A hostile DNS server with a zero TTL could answer a public address for the check and a
  private one for the connection. Pinning the connection to the checked address needs a custom
  undici agent; not done in this timebox.
