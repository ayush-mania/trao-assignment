# 0008 — Generated, edited and pinned state lives beside the kit, not inside it

## Status

Proposed, 2026-09-11. Locks with TRAO-19 (kit edit API).

## Decision (proposed)

The stored kit document is `{ kit: <Appendix A>, meta: { items: { [id]: { origin, pinned, gen, updatedAt } },
sections: { company_brief: {...}, schedule: {...} }, order: { [category]: questionId[] } } }`.
`origin` ∈ generated | edited | manual; `gen` is the section generation counter at creation.
Regenerating a section bumps its counter and replaces only items with `origin = generated`,
`pinned = false` and an older `gen`; edited, manual and pinned items keep their position. Reorder is
a change to `order`, independent of content. The batch output and the validator only ever see `kit`.

## Why

Section 6 calls this the hardest state problem in the assessment; Appendix A must stay exact for the
batch grader, so builder metadata cannot live inside it. Keying metadata by the stable ids the code
already assigns (ADR 0004) makes the merge rule a one-line filter.

## Rejected

Full-kit version snapshots (cannot merge at item level); extra fields inside Appendix A objects.
