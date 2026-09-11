# Feature: kit generation pipeline

> Entry points: `scripts/evaluate.ts` (`npm run evaluate`), `apps/api` runner (TRAO-18)
> Source: `packages/core/src/pipeline`, and every other `packages/core` module
> Decisions: ADR 0002, 0003, 0004, 0005, 0006, 0007

**A kit is produced by ten deliberate steps that each respond to what the previous ones found.**
The graph in `docs/GRAPH.md` §2–§3 is the authoritative sequence; this page is the walkthrough.

## Walkthrough on the Acme fixture (real run, 2026-09-11, ~27 s)

1. `validate_input` — 781-char JD, 5 days.
2. `extract_requirements` — 8 requirements: 5 must (from the "Requirements" block), 3 nice (from
   "Nice to have" incl. "Bonus points for robotics"). Nothing invented, nothing rejected.
3. `crawl_company` — homepage → ranked links → `/company/` (about) → `/company/handbook/` →
   `/company/handbook/how-we-interview` (hiring, classified from its text). Stopped: found both.
   4 pages fetched, 4 skipped (`budget_exhausted`, `blocked_by_robots`).
4. `search_discussion` — "Acme Robotics interview": HN 0 hits, Reddit 403 → skipped, gap recorded.
5. `company_brief` — one call over about + hiring page; summary ends with "Note: no public
   discussion of their interview process was found". `hiringProcess` = "take-home, then system
   design, then behavioural".
6. `generate_questions` — plan: technical 6, behavioural 4, system-design 4 (hiring page mentions
   a design round), company-fit 3. One call each with its own instructions.
7. `close_coverage` — must-haves all covered on pass 1; `r7` (nice: robotics) uncovered → reported.
8. `flashcards` — 13 cards, ids `f1…`, requirement ids verified.
9. `build_schedule` — 5 days, 260 minutes; day 1 = system design + Node.js (heaviest musts).
10. `assemble_and_validate` — `validateKit` ok.

## The honest paths

- **No hiring page** (Northwind): crawl exhausts links, `stoppedBecause: no_more_links`, brief notes it,
  no system-design category unless the role is senior.
- **Unreachable / invalid URL**: crawl skipped with the reason, discussion search skipped (no
  company name), brief is the fixed honest text with `sources: []`, kit still `ok`.
- **Two-line JD**: 1 requirement, `thin: true`, note appended to the brief, kit deliberately small.
- **Model outage**: after all providers fail, the run is `failed: LLM_UNAVAILABLE` with the steps that
  did complete preserved.

## Running it

```bash
npm run fixtures &
npm run evaluate -- --input cases.example.json --output kits.json
```

Progress and timings stream to stderr; the JSON file is Appendix B.
