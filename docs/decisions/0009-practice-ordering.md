# 0009 — Practice ordering: weakest first, then stalest

## Status

Accepted, 2026-09-11.

## Decision

The next practice session orders flashcards: unseen first, then ascending last confidence
(1 shaky, 2 okay, 3 solid), ties by least recently seen, then kit order. Progress is per card:
`{ confidence, seenAt, reviews }`. A session's order is fixed when it starts.

## Why

Section 7 leaves this open ("a simple confidence-weighted sort is fine; a proper spaced-repetition
interval is fine. Pick one and defend it"). The horizon here is the days until one interview,
typically single digits; SM-2-style intervals grow into weeks and would schedule most cards past the
interview. "Weakest first, then what you have not looked at longest" is what a candidate cramming
for a date actually wants, is explainable in one sentence, and is a pure function with three tests.

## Rejected

SM-2 / Leitner boxes (interval maths that never pays off inside the window); random shuffle (loses
the point of rating); reshuffling mid-session (disorienting).
