# 0003 — LLM provider chain chosen from measured free-tier limits

## Status

Accepted, 2026-09-11. Supersedes the initial "Gemini 2.5 Flash primary, Llama 3.3 70B fallback".

## Decision

Chain: Gemini `gemini-3.5-flash-lite` → Gemini `gemma-4-26b-a4b-it` → Groq `openai/gpt-oss-120b`.
Every model id and limit is an `.env` knob. The client keeps one RPM/TPM bucket per provider,
honours `Retry-After`, and on a `Retry-After` of 10 s or more with a fallback available fails over
immediately and puts the provider in cooldown until its window passes. Output drift that real
models produce (null for a string, bullet arrays for a paragraph, a bare root array) is accepted by
preprocessing; anything else gets one repair round-trip.

## Why — what the first real runs showed

Neither vendor documents per-model free numbers (both point at the dashboard), so they were read
from the APIs: Gemini's 429 bodies name the quota (`GenerateRequestsPerDayPerProjectPerModel-FreeTier: 20`
for `gemini-3.6-flash` — Google's own recommended replacement — which cannot serve a 7–9-call kit),
`gemini-3.5-flash` is 5 RPM, `gemini-3.5-flash-lite` 15 RPM, Gemma took a 20-request burst without
a 429; Groq's headers show 8,000 tokens/min for its main models — the real choke, not requests.
The first chain waited the full Retry-After (45–59 s) before failing over: 247 s for five cases with
long stalls. Cooldown failover and per-provider buckets brought it to ~135 s with zero failovers.

Gemma specifics verified live: rejects `thinkingConfig` ("not supported"), ignores JSON mime type,
returns its reasoning as parts flagged `thought: true` — the provider filters those.

The user's rule: this is an assignment, not production; a less capable model that does the work is fine.

## Rejected

`gemini-3.6-flash` (20 RPD), `gemini-3.5-flash` (5 RPM), `llama-3.3-70b-versatile` (retired, 404),
`groq/compound` (agentic, 250 RPD), a single global rate bucket, waiting out long Retry-After.

## Revisit when

A daily cap on flash-lite is observed, or Trao's grading environment shows different limits.
