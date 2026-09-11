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

## Architecture, retrieval, sequencing, edit state, schedule, decisions

_Filled in as each part lands._
