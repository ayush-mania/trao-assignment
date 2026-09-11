# AI Interview Prep Kit

Turns a pasted job description + a company website into a personalised interview prep kit:
company brief, role breakdown, categorised question bank, flashcards and a day-by-day study
schedule — then lets you edit it and practise against it.

Built for Trao's full-stack engineering assessment.

## Stack

| Layer    | Choice                                                                             | Why                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui                                        | Preferred stack; shadcn gives accessible, keyboard-navigable primitives                                                  |
| Backend  | Node + Express (TypeScript)                                                        | Preferred stack; long-lived process on Railway runs the generation pipeline                                              |
| Pipeline | `packages/core` — pure TypeScript, no HTTP/DB                                      | Same code path for the web app and the batch CLI (Section 9)                                                             |
| Database | MongoDB Atlas                                                                      | Preferred stack                                                                                                          |
| LLM      | Gemini `gemini-3.5-flash-lite` → Gemini `gemma-4-26b` → Groq `openai/gpt-oss-120b` | All free tiers; chosen by measured limits (see LLM layer); client fails over on long Retry-After, 5xx or a retired model |
| Scraping | `undici` fetch + `cheerio` + `robots-parser`                                       | No headless browser: careers/about pages are server-rendered; local fixture sites are static                             |

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

Checks: `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`. GitHub Actions
(`.github/workflows/ci.yml`) runs all of them plus a full build on every push and pull request to
`master`, from a clean `npm ci` on Node 24 (current LTS). Deploys are handled by Vercel's and Railway's
own GitHub integrations, not by CI.

## Batch entry point

```bash
npm run evaluate -- --input cases.json --output kits.json
```

Reads an array of `{ id, jd, company_url, days }` cases (Appendix B input) and writes
`{ version, generated_at, kits: [{ id, status, kit, error }] }`. Needs only the LLM keys from
`.env` — no database, no running server. `scripts/evaluate.ts` calls `runToCompletion()` from
`packages/core`, the same function the API's runner uses; there is no second implementation.

- Cases run one at a time by default (`--concurrency N` to change) because free-tier limits are
  per minute; every step is logged to stderr with timing and what it found.
- A case that fails is recorded as `status: "failed"` with an error code
  (`INVALID_INPUT`, `LLM_UNAVAILABLE`, `KIT_INVALID`, `INTERNAL`) and the run continues.
  Unreachable sites, missing hiring pages and empty discussion searches are **not** failures — the
  case is `ok` and the kit says what could not be found.
- Exit code 0 when the run completed (even with failed cases); 2 only when the input file cannot
  be read or no LLM provider is configured.
- Company sites may be on a local address: set `ALLOW_PRIVATE_URLS=true` in `.env` for such runs.

Try it against the bundled fixture sites:

```bash
npm run fixtures &                      # serves http://localhost:8099/acme/ and /nohire/
npm run evaluate -- --input cases.example.json --output kits.json
```

`cases.example.json` covers a full JD with a buried hiring page, a company with no hiring page, a
two-line stub with a 60-day schedule, an unreachable site and an invalid URL.

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

- a rate limiter **per provider** (requests and estimated tokens per minute) so we slow down before
  the provider does, and an idle provider is never throttled by a busy one;
- retry with exponential backoff (2s, 4s, 8s … capped 60s) that honours `Retry-After` / Gemini's `retryDelay`;
- **cooldown failover**: when a provider asks us to wait 10s or more and another provider exists, we
  fail over immediately and skip the cooling provider until its window passes;
- failover down the chain once a provider's attempt budget (4) is spent or it returns a non-retryable error;
- `completeJson(schema)`: JSON is extracted (fences, prose, trailing commas repaired) and validated with zod;
  common drift (null for a string, a bullet array for a paragraph, a bare root array) is accepted
  directly; anything else gets one repair round-trip with the concrete error, a second failure is an
  error the step reports.

### Models and free-tier limits (measured 2026-09-11)

Neither vendor publishes per-model free numbers in its docs (both point at the account dashboard),
so these were read from the APIs themselves: Gemini's 429 bodies name the quota and its value,
Groq returns `x-ratelimit-*` headers on every call.

| Provider / model               | Free limit that bites                                                     | Role                             |
| ------------------------------ | ------------------------------------------------------------------------- | -------------------------------- |
| Gemini `gemini-3.5-flash-lite` | 15 requests/min                                                           | primary                          |
| Gemini `gemma-4-26b-a4b-it`    | ≥20 requests/min (no 429 in a 20-burst); no thinking config, no JSON mode | fallback 1                       |
| Groq `openai/gpt-oss-120b`     | 30 requests/min but **8,000 tokens/min**, 1,000 requests/day              | fallback 2                       |
| Gemini `gemini-3.6-flash`      | **20 requests/day**                                                       | not usable: one kit is 7–9 calls |
| Gemini `gemini-3.5-flash`      | 5 requests/min                                                            | too slow                         |
| Groq `llama-3.3-70b-versatile` | retired (404)                                                             | —                                |

A five-case batch against the fixture sites completes in **~135 s** on this chain, with no
failovers. Every model id and limit is an `.env` knob (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`,
`GROQ_MODEL`, `*_RPM`, `*_TPM`).

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

### Finding the about and hiring pages

`crawlSite()` is a best-first crawl, not a path list. The homepage's links are scored by URL path and
anchor text (`interview`, `how-we-hire`, `careers`, `jobs`, `join`, `handbook` … high; `about`,
`company`, `team`, `culture`, `values` … medium; `login`, `pricing`, `privacy`, `press` … dropped;
off-site links dropped; deeper paths cost a little). The highest-scoring unvisited link is fetched
next, its links are scored into the same queue, and each fetched page is classified `about` /
`hiring` / `other` from its own text (URL path is weaker, secondary evidence). The crawl stops when
both kinds are found, or at 12 pages / 60 s / no links left. Everything not fetched is listed with a
reason (`budget_exhausted`, `http_404`, `blocked_by_robots` …). A site with no hiring page ends with
`stoppedBecause: no_more_links` and no `hiring` page — that is a finding the brief reports, not an error.

`npm run fixtures` serves two test companies on `http://localhost:8099`: `/acme/` (hiring process
buried at `/company/handbook/how-we-interview`) and `/nohire/` (about page, no hiring page anywhere),
with a root `robots.txt` that disallows `/nohire/blog`. The crawler tests run against these files.

### Public discussion of the interview process

`searchPublicDiscussion(company)` queries two free, key-less sources in parallel: the Hacker News
Algolia API and Reddit's public JSON search. Results are kept only if they mention the company name
and an interview word, de-duplicated by URL, newest first, at most 8 snippets, each with its source URL
so the kit can cite it. A failing source is recorded and skipped. Glassdoor, Blind and LinkedIn block
automated access and are not attempted. Zero results is reported as such — the brief is explicit
that an honest "nothing found" beats an invented brief.

## Requirement extraction

`packages/core/src/extraction`. One schema-locked LLM call proposes title, seniority, responsibilities
and requirements, and for every requirement an `evidence` phrase copied verbatim from the JD. Then code
decides:

- **Anti-invention gate** — a requirement whose evidence cannot be found in the JD (case- and
  whitespace-insensitive) is dropped and logged. The model cannot add a requirement the posting
  does not contain.
- **must / nice from wording, not opinion** — the sentence around the evidence is checked for
  explicit phrasing ("nice to have", "bonus", "preferred", "ideally" → `nice`; "required", "must",
  "minimum", "strong" → `must`), then the nearest heading above it ("Nice to have" vs
  "Requirements"), then default `must`. "Required" and "bonus points for" are never the same thing.
- **Ids** `r1…` assigned in code; near-duplicates dropped.
- **Thin JD** — under 200 characters or fewer than two requirements sets `thin: true` with a note that
  the kit is deliberately thin. An empty requirement list is a valid answer.

## Generation

`packages/core/src/generation`. Generation never touches the network; it consumes a `ResearchContext`
(homepage, about page, hiring page, discussion snippets, and the list of gaps) built by the pipeline.

- **Company brief** — one call over the retrieved documents only. If nothing was retrieved there is
  no call at all: the brief states that no public information could be found and why (site
  unreachable, no hiring page, no discussion). `sources` lists only URLs actually used.
- **Questions, one call per category** — `planCategories()` decides deterministically which
  categories to generate and how many questions each gets: technical/domain requirements →
  `technical`; behavioural requirements and responsibilities → `behavioural`; `system-design` for
  senior roles or when the hiring page mentions a design round; `company-fit` only when we have
  company documents. What the hiring page says changes the mix: a take-home-first process asks
  fewer whiteboard-style technical questions; a stated system-design round asks four design
  prompts instead of two. Negated sentences ("we do not do whiteboard puzzles") are ignored when
  reading these signals. Each category call has its own system prompt (STAR-shaped behavioural
  questions, trade-off-driven design prompts, company-fit grounded in the documents). Code verifies
  every `requirement_ids` entry exists, clamps `difficulty` to 1–3 and assigns `q1…`.
- **Flashcards** — one call over the requirements; `f1…` ids and `requirement_ids` verified in code.

## Coverage and the second pass

`packages/core/src/coverage`. `findGaps()` is a set difference in code — every requirement id minus
every id any question references — split into must-have and nice-to-have gaps. `closeCoverage()`
then loops: for the gap requirements only, grouped by category, it calls the same per-category
generator with an explicit "these have no question yet, write one each and reference the id"
instruction, appends the results and re-checks. A question that comes back without a requirement
id closes nothing and is discarded.

Stop rules, in order: no must-have gap left (nice-to-have gaps may remain and are reported in
`coverage.uncovered_requirement_ids`); a pass that made no progress (do not burn tokens on a model
that will not attribute); a hard cap of **3 passes** (initial generation counts as pass 1). Three is
enough to close every realistic gap and keeps a five-case batch inside its time budget under
free-tier rate limits. `coverage.passes` reports what actually ran.

## Schedule allocation

`packages/core/src/schedule/allocate.ts` — arithmetic only, no model. Given `days`, the requirements and
the questions:

1. **Topics** — one per requirement holding its questions (a question tied to several requirements
   is studied with the first one). Minutes per question by difficulty: 10 / 15 / 25. Topic weight =
   priority (must 3, nice 1) × mean difficulty. Sorted must-first, then heaviest first. Questions
   with no requirement (company-fit) form a final "Company and fit" topic.
2. **Allocation** — topics are dealt in that order to the lightest day within a window that opens
   one day at a time, so must-have and hard material lands early while daily load stays balanced.
3. **More days than topics** (a 60-day request) — spare days become review days that revisit
   earlier questions, must-haves and hard questions first; ids stay valid and no day is empty.
4. **One day** — everything lands on day 1. **No questions** (thin kit) — N general-preparation days.
5. Every day has a focus, integer minutes (minimum 30) and question ids. A post-condition check
   mirrors Section 8 (exactly N days, every must-have with a question scheduled, every id exists)
   and throws if violated, because that would be a bug in this file, not a model hiccup.

## Engineering docs

The sections above are the "what". The "why" and the current shape of the system live in `docs/`:

- [`docs/GRAPH.md`](docs/GRAPH.md) — the one current-state picture: modules, the ten-step run, what
  each step reads and writes, what code decides instead of the model, the provider chain, open questions.
- [`docs/decisions/`](docs/decisions/README.md) — architecture decision records (stack, step machine,
  LLM chain, code-decides rules, retrieval policy, coverage loop, schedule, edit-state model).
- [`docs/ENFORCEMENT.md`](docs/ENFORCEMENT.md) — every scored rule and whether code, a test, or only a
  reviewer holds it.
- [`docs/features/`](docs/features/pipeline.md) — per-feature walkthroughs, starting with the pipeline
  on a real run.

## Backend

`apps/api` — Express 5, MongoDB (Mongoose), no SDK-heavy dependencies. Concerns are separate files:
`config` (all env access, fails fast), `models` (User, Session, Kit), `middleware` (session cookie →
`req.user`; zod body validation; structured errors), `services` (auth with `scrypt` + server-side
sessions; kits scoped by user with 24 h duplicate reuse; the runner), `routes`, and an `app` factory
the tests build with a fake LLM. Full walkthrough: [`docs/features/api.md`](docs/features/api.md).

What happens when generation takes ninety seconds, fails halfway, or is triggered twice: the kit
document stores the pipeline state after **every step**, the web app polls it, a failed run can be
retried from the failed step, a crashed process resumes on boot, and an atomic per-document lock
means the same step never runs twice. A duplicate submission returns the existing kit.

Local: `docker compose up -d mongo` then `npm run dev -w apps/api`. Production: MongoDB Atlas via
`MONGODB_URI`, API on Railway, cookie `SameSite=None; Secure` because the web app is on another site.

## Generated, edited and pinned state

Builder state lives **beside** the Appendix A kit, never inside it, so the batch output stays exact:
`meta.items[id] = { origin: generated | edited | manual, pinned, gen }`, `meta.order[category]` for
display order, per-section generation counters and monotonic id counters. Regenerating one section
(the brief, one question category, flashcards, or the schedule) bumps that section's counter and
replaces only items that are generated, unpinned and from an older generation — a question the user
wrote, edited or pinned survives in place, and nothing outside the section is touched. Coverage and
the schedule are recomputed deterministically after any question change, and every write is
validated before it is saved. Full rule and the reasoning: [ADR 0008](docs/decisions/0008-edit-state-model.md).

## Frontend

`apps/web` — Next.js 16 App Router, Tailwind 4, shadcn/ui (Base UI), TanStack Query. It imports only
**types** from `@trao/core`. Session gate with `?next=` return, kit list, single and bulk kit creation,
and a live ten-step generation timeline that polls the persisted run state every 2 s and offers
"Retry from the failed step" on failure. Explicit loading, empty and error states everywhere; real
links and forms so everything is keyboard-reachable. Walkthrough: [`docs/features/web.md`](docs/features/web.md).

## The builder

Inline editing of every question, answer outline, flashcard and the brief (debounced, optimistic,
rolled back on error); drag-and-drop **and keyboard** reordering with dnd-kit; move between
categories; add and delete by hand; pin. Each item shows whether it is generated, edited, yours or
pinned, and every Regenerate button states what it will replace and what it will keep before you
click — a regeneration of one category, the brief, the flashcards or the schedule never touches
anything else. Details: [`docs/features/web.md`](docs/features/web.md).

## Practice mode

`/kits/:id/practice` steps through the flashcards one at a time — reveal, then rate **Shaky / Okay /
Solid** (Space and 1 / 2 / 3 on the keyboard). Ratings are saved per card (`POST
/kits/:id/practice/rate`, optimistic), and the coverage list shows what has been covered, how it went
and how many times. **Next-session ordering** (`packages/core/src/practice/order.ts`): unseen cards
first, then ascending confidence, ties broken by least recently seen. This is a confidence-weighted
sort with a recency tiebreak rather than spaced-repetition intervals, on purpose: the horizon is the
days until one interview, where "weakest first, then stalest" is what a candidate needs and interval
scheduling designed for months adds nothing. A session's order is fixed when it starts so rating a
card does not reshuffle the deck under you.

## Known limitations

- **DNS rebinding.** The URL policy resolves a hostname and checks the addresses, then `fetch` resolves
  it again. A hostile DNS server with a zero TTL could answer a public address for the check and a
  private one for the connection. Pinning the connection to the checked address needs a custom
  undici agent; not done in this timebox.
