# 0008 — Generated, edited and pinned state lives beside the kit, not inside it

## Status

Accepted, 2026-09-11 (locked with TRAO-19). Demonstrated against the running API with real models.

## Decision

The stored kit document is `{ kit: <Appendix A>, meta }` where

```
meta.items[id]  = { origin: generated | edited | manual, pinned, gen, updatedAt }   // questions, flashcards
meta.gens       = { 'questions:<category>': n, company_brief: n, schedule: n, flashcards: n }
meta.sections   = { company_brief: { origin }, schedule: { origin } }
meta.order      = { [category]: [questionId, …] }        // reorder changes this, never content
meta.counters   = { q, f }                                // monotonic: an id is never reused
```

**Merge rule.** Regenerating a category bumps its `gen`, runs the same per-category generator with
the persisted research, and replaces only questions that are `generated`, unpinned and from an older
`gen`. Edited, manual and pinned questions keep their positions; new ones are appended. Brief and
flashcards follow the same rule at section/item level. Schedule regeneration is deterministic and
takes an optional new day count. After any change to questions, coverage is recomputed as a set
difference and the schedule is rebuilt (ADR 0004). Every write is validated with `validateKit`
before it is persisted; the batch output and the validator only ever see `kit`.

`origin` transitions: generated → edited (on any patch); manual stays manual; pinned is independent.

## Why

Section 6 calls this the hardest state problem in the assessment and Appendix A must stay exact
for the batch grader, so builder metadata cannot live inside the kit. Keying metadata by the stable
ids the code already assigns makes the merge a one-line filter. Monotonic counters were added after
a test showed `nextId` scanning the _remaining_ questions reused `q4` for a fresh question right
after regeneration removed the old `q4`.

## Rejected

Full-kit version snapshots (cannot merge at item level); extra fields inside Appendix A objects;
computing the next id from what is left.
