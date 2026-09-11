# 0007 — Deterministic schedule allocation

## Status

Accepted, 2026-09-11.

## Decision

Topics = one per requirement with its questions (a multi-requirement question studies with its first
still-existing requirement). Minutes per question by difficulty 10/15/25. Weight = priority (must 3,
nice 1) × mean difficulty; sorted must-first then heaviest. Topics are dealt to the lightest day in a
window that widens one day at a time. More days than topics → review days reusing earlier questions,
hardest first. One day → everything on day 1. No questions → N general-preparation days. Minimum 30
minutes, all integers. Post-condition check mirrors Section 8 and throws on violation.

## Why

Section 8: "this is arithmetic and allocation. It belongs in your code, not in a prompt." Determinism
makes it testable (1, 2, 5, 60 days; all must-haves; ids valid; earlier days heavier), which Section 14
asks for by name.

## Rejected

Round-robin (ignores priority); asking the model; allowing empty days.
