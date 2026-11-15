# Performance qualification

Turn-phase profiling commands (`one-turn.ts`, `trace-callsites.ts`) are described in [AGENTS.md](../../AGENTS.md#turn-phase-performance-rules). Lighthouse budgets live in [`lighthouse/`](./lighthouse/README.md).

## Money-movement primitive qualification

The corporation payout primitive pilot runs with
`npx tsx scripts/perf/money-move-qualification.ts --receipt receipt.json`.
Run the identical harness in the baseline and candidate source worktrees; add
`--baseline baseline.json` to the candidate command. It uses an owned temporary
Mongo process and synthetic holders, never a configured database. Seven cases
cover 3/12/120 holders, zero/3 ms simulated latency per awaited DB operation,
duplicate replay and a lost credit acknowledgement. This qualifies the money
move primitive, not a whole corporation phase or world.

Each run has a ten-minute cap and stops its owned storage process on timeout.
The receipt pins source, fixture, harness, dependencies and runtime; compares
explicit balances, settled keys and journal legs; and records existing profiler
counts, returned BSON bytes/documents, Node lifetime peak RSS and heap used.
Node RSS excludes Mongo and host memory. For ordinary payouts, the matched
baseline caps commands, returned documents and bytes. A lost bulk-write
acknowledgement interrupts multiple credits, while a lost scalar-write
acknowledgement interrupts one: recovery cost is diagnostic because interrupted
states differ; final outputs must still match. Node peak RSS permits 25% process startup noise;
wall clock is diagnostic. The existing whole corporation phase command budget
also remains a ceiling, not proof that a whole phase fits. Never increase a
budget just to make qualification pass.
