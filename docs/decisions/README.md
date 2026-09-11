# Architecture Decision Records

One file per decision that shapes the code. Format: status, decision, why, rejected alternatives,
what would make us revisit. Argued once, not re-argued every session. Superseded records stay with
a `Superseded by` line — never deleted. The Notion decision log keeps one-line entries that point here.

| ADR                                        | Decision                                                                                                                     | Status                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [0001](0001-stack-and-layout.md)           | Monorepo with `packages/core` shared by API and CLI; TypeScript everywhere; Next + shadcn; Express on Render; Vercel for web | Accepted                      |
| [0002](0002-pipeline-as-step-machine.md)   | The pipeline is a resumable step state machine; research never fails a run                                                   | Accepted                      |
| [0003](0003-llm-chain-and-limits.md)       | Provider chain and limits chosen from measured free tiers; per-provider buckets; cooldown failover                           | Accepted                      |
| [0004](0004-code-decides-not-the-model.md) | Ids, must/nice, coverage, schedule, company name and category plan are decided in code                                       | Accepted                      |
| [0005](0005-retrieval-policy.md)           | Best-first crawl, SSRF policy, robots, caps; HN + Reddit only for discussion; no headless browser                            | Accepted                      |
| [0006](0006-coverage-loop.md)              | Coverage loop: max 3 passes, stop on no must-have gaps or no progress                                                        | Accepted                      |
| [0007](0007-schedule-allocation.md)        | Deterministic allocator: weighted topics, widening window, review days                                                       | Accepted                      |
| [0008](0008-edit-state-model.md)           | Generated / edited / pinned state kept beside the kit, not inside it                                                         | Proposed (locks with TRAO-19) |

Smaller working rules that do not need an ADR live in `docs/ENFORCEMENT.md` (what holds them) and
the README (what Trao asked for).
