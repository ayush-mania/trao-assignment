# 0006 — Coverage loop: three passes, stop on no must-have gaps or no progress

## Status

Accepted, 2026-09-11.

## Decision

`findGaps` = requirement ids minus ids referenced by any question, split must/nice. `closeCoverage`
generates questions only for gap requirements, grouped by category, with an explicit instruction to
reference the id, then re-checks. A returned question without a requirement id closes nothing and is
discarded. Stop when no must-have gap remains (nice gaps are reported, not chased), when a pass
makes no progress, or at 3 passes (initial generation is pass 1). `coverage.passes` reports what ran.

## Why

Section 4 exists "to force a loop rather than a single shot"; shipping an uncovered must-have is the
one failure the brief names. Three passes closes every realistic gap and keeps five cases inside the
15-minute batch budget under free-tier limits. The validator also refuses a kit whose `coverage`
block contradicts its questions, so a loop bug cannot ship silently.

## Rejected

Unlimited passes; asking the model to judge coverage; chasing nice-to-have gaps with extra calls.
