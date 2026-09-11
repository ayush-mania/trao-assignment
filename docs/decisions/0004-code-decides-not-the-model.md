# 0004 — What the model proposes, code decides

## Status

Accepted, 2026-09-11.

## Decision

The model is asked for structured proposals; code makes every decision the brief calls
bookkeeping, and several it does not:

- **Requirement existence** — each proposed requirement carries an `evidence` phrase; if it cannot
  be found in the JD (case/whitespace-insensitive) it is dropped and logged. Logistics
  ("start immediately", "Remote") are filtered by an anchored regex.
- **must / nice** — the sentence around the evidence is checked for explicit wording
  ("nice to have", "bonus", "is a plus", "preferred", "ideally" → nice; "required", "must",
  "minimum", "essential" → must), then the nearest real heading, then default must. Depth
  adjectives (strong, proven, expert) never beat a Nice-to-have heading. The list-item occurrence
  of the evidence wins over an intro mention.
- **Ids** — `r<n>`, `q<n>`, `f<n>` assigned in code; prefix bound per list in the schema; the next
  id is max+1 so deletions never cause reuse.
- **Category plan** — which question categories and how many, from requirement kinds, seniority
  and hiring-page signals (negated sentences ignored).
- **Coverage gaps** — set difference. **Schedule** — arithmetic. **Company name** — JD, else site
  title, never a hostname; unknown name means no discussion search.

## Why

20 automated points ride on "must-haves found, marked correctly, nothing invented" and 15 on
coverage and schedule. Verifying is stronger than asking nicely, and it is what Trao says they read
for: "what you refused to let the model decide". Each rule above was added after a concrete failure
(an invented AWS certification, "5 plus years" read as nice, a brief fabricated from Hacker News
threads about "localhost").

## Rejected

Trusting the model's `priority` field; accepting any non-empty string as an id; asking the model
"did you cover everything?".
