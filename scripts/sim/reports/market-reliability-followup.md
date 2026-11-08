# Market reliability follow-up

## Scope and resource controls

Same worktree as producer-market-performance, baseline 5535abaf10 (production
rules identical to 731b8c1c36). No database
mutations. One pinned CPU at BelowNormal priority, sequential processes. Synthetic
replay used a 512 MiB V8 heap ceiling; the captured-world candidate used 384 MiB.
These are heap limits, not total process memory limits. Reported peak RSS for the
captured replay was approximately 1.15 GiB, including its runtime and output encoding.
No build or full-project TypeScript run was used to increase local resource pressure.

## Changes

- Cache unrestricted route results (`null`) as real cache entries.
- Cache immutable supplier-country metadata.
- Share lazy pro-rata supplier stock within a price/reachability cohort. Accumulate
  country flows by country; preserve site-specific internal management values.
  Flush each constrained cohort before the next price/group can observe its stock.
- Keep opening budgets, shared-budget caps, priorities, own-site transfers, route
  membership, supplier IDs and receipt allocation semantics unchanged.
- Corporation timeout: 300 seconds. Pre-settlement market ceiling: 240 seconds.
  Deadlines still fail before claiming a receipt; claimed journals retain replay.
  Failure messages include completed stage timings.
- Independent electoral/party phases can run after a retryable corporation stop,
  after funding siblings and timed-out callbacks drain. Economic dependants and
  unsafe partial-write failures remain blocked. The world clock does not advance
  until required settlement succeeds. Completed independent work is carried on retry.

## Synthetic same-state evidence

`scripts/sim/marketReliabilityPerformance.ts <baseline rules directory>` compares
allocation, balances, prices, country flows and route results against the baseline.
Fixture: 40 countries, 800 suppliers, one directed embargo, 16 price levels.

| Buyers | Baseline route checks | Candidate route checks | Baseline clearing | Candidate clearing |
| ------ | --------------------: | ---------------------: | ----------------: | -----------------: |
| 1,000  |                38,064 |                  1,560 |            330 ms |              80 ms |
| 4,000  |               152,139 |                  1,560 |          1,241 ms |             236 ms |

Values matched within a relative tolerance of 1e-8. Rules and embargo tests also
exercise own-stock, reservations, partial budgets, public priorities and replay.
This fixture does not predict production wall time.

## Captured full-market evidence

Read-only turn 742 request, 8,885 producers, 2,041 accounts. Only its request was
downloaded: 23 compressed chunks, 2 logical reads, 2,337,288 encoded payload bytes
(not a BSON/round-trip profiler measurement). Input and per-site results remain in
ignored local temporary files; no player data is committed.

Both arms used the saved two-pass planning count, without a wall-clock planning
cutoff, and a 240-second replay ceiling. Pure `advanceProducerEconomy` replay only:
it does not execute Mongo settlement or the remainder of a full turn.

| Stage                                  | Baseline | Candidate |
| -------------------------------------- | -------: | --------: |
| Final clearing, two credit trials      | 2,764 ms |  1,684 ms |
| Spillover clearing                     | 1,346 ms |    734 ms |
| Combined final and spillover           | 4,111 ms |  2,417 ms |
| Replay plus local output serialization | 9,730 ms |  8,110 ms |

Exact comparison: 1,077,815 numeric values, 222,001 fills and 12,960,146 logical
supplier trades. Zero numeric or structural differences. Balances, producer
results, orders, prices, payables, planning and country flows all matched exactly.
This proves same-input market equivalence for this capture, not full-turn I/O
performance or a guarantee against every future deadline. New turn-path Mongo
commands/bytes: zero added to the successful path. The independent recovery path
does previously blocked political work and persists its normal phase evidence.

## Health reporting

Only executed failures count as processing errors. `notReached` stays visible as
blocked work. Historical inflated snapshots are interpreted from their phase
statuses without rewriting stored records. Cards label their actual turn rather
than claiming to aggregate 24 hours. Timeout-pressure alerts use each phase's own
timeout, including the corporation's five-minute window.

## Verification and limits

- 844 targeted tests passed in 76 files, followed by a new electoral-prerequisite
  regression and 17 full-turn host integration cases: market rules/production/settlement,
  embargoes, fair allocation, phase timeout/drain/resume, adapter orchestration,
  health snapshots and health-warning API behavior.
- Changed-file ESLint and formatting passed. Architecture audit: zero blocking
  findings and 71 existing warnings, with the new UI import warnings removed.
- 32 architecture, turn-read projection and reset/index contract tests passed in
  eight files. Full-turn host integration verifies independent electoral work
  completes while laws and dependent finance stay blocked after a market failure.
- A focused TypeScript check reached the 512 MiB heap ceiling. It was stopped
  without raising the resource limit. Type checking remains unqualified.
- The complete architecture-contract command's worker exited while loading
  `resetGameWorld.test.ts` under the 768 MiB heap ceiling. This is not a passing
  full reset suite; it remains unqualified under the resource ceiling.
- No production build, whole-repository test suite or live write was run.
