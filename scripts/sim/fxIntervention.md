# FX intervention qualification

Run `npx tsx scripts/sim/fxIntervention.ts`. The script has no database access and uses synthetic inputs only. Issue-first was waived by the user for this implementation.

## Questions and assumptions

Does spending stop at useful impact, can a narrow corridor settle without alternating overshoots, and are equivalent GBP/USD/JPY-style denominations neutral? Does a fixed budget buy less impact in a deeper market?

Scenarios use frozen fundamentals, no noise or organic flow, and ample reserves unless a budget is explicit. The narrow-band trajectory runs for 48 turns. These are deterministic rules sensitivity checks, not full-world economic forecasts or evidence that any target is permanently achievable.

## Results

- At minimum market depth, a 3% breach requests 200,000 anchor units rather than the legacy 600,000. A 10% breach also stops at 200,000, rather than requesting 2,000,000 for the same capped effect.
- A 0.9995 to 1.0005 corridor spends approximately 8,492 anchor units over 48 turns, with zero overshoots, versus approximately 4,093,554 under the old controller.
- Home rates of 0.6, 1 and 140 produce equal anchor costs and relative movement, with proportionate home-currency costs.
- With a 100,000 spending limit, market depths of 20 million, 200 million and 2 billion produce progressively smaller corrections. All three respect the limit.

## Design limitations

The market-depth floor of 20 million anchor units and automatic budget share of 10% are gameplay calibration choices, not empirically fitted FX parameters. The ceiling remains a 1% pressure contribution, reduced by credibility. Sustainable-range warnings assume constant fundamentals and sustained maximum pressure without organic flow or reserve constraints. Actual markets, prices and budgets change.

The two reserve legs and their paid publication receipt are one guarded bank update. Publication and receipt completion are separate recoverable writes. A pending receipt is resumed before another intervention; a monotonic turn guard prevents concurrent, duplicate and delayed older-turn re-debits. Pending payloads exist only until publication completes and are removed by the existing centralBanks reset lifecycle. No new collection or GameState field is introduced.

Compared with the old funded path, publication adds at most two write round trips per defended currency and no per-currency read. The existing phase budget is 500 commands. Failure-injection tests cover interrupted publication, replay and stale balance guards. Full-turn performance evidence is recorded below. This does not replace long-trajectory balance qualification; the rules sensitivity script is not a full-world economic forecast.

## Compatibility and reset policy

No backfill is needed. Existing commitments retain their bounds and attribution. An absent spending limit selects the new automatic 10% directional reserve budget; that behavior change is intentional. The optional pending settlement and last-settled-turn fields start absent. All reserve guards are primary-key lookups, so no new index is needed.

`resetGameWorld` deletes the `centralBanks` collection's documents before `seedForex` recreates the banks, clearing both receipt fields. A pending receipt deliberately has no TTL: a paid but unpublished quote must remain recoverable. Integration tests use an owned standalone MongoDB and verify competing claims, interrupted publication, insufficient balances and rejection of older-turn retries after a later settlement.

## Matched full-world replay design

The local performance replay uses an owned MongoDB 8.0.12 one-node replica set and Node v24.14.0 on Windows x64. It bootstraps `1991-default` once with RNG seed `fx-defence-replay-20261018`, then copies all documents and non-primary indexes into separate baseline and candidate databases. Empty primary-key-only collections are created lazily by MongoDB, equally in both arms. It does not load a configured URI or clone live data. The final audited run's initial normalized BSON SHA-256 is `e749ee981f5009bc876713ca46a9024ab23cbb8dd5b087ce8f86ef3e94c2770b`.

The shared starting world has 228 collections, 232 regions, 2,489 synthetic NPPs, 508 corporations, 647 corporate sectors, 23 central banks and 1,532 elected officials. The replay uses full NPP autonomy v3 and the complete `processTurn` pipeline from turn 1 to turn 2, not an FX-only mock. Each source runs an inactive-policy control and a funded intervention case covering US, UK and JP. The baseline is `85bbd3b69e0a6e34201d7fe06c8a25a39c391e7d`; candidate runtime-file hashes are retained with the measurements before commit.

Counters come from the existing Mongo command monitor and phase profiler, including returned-document BSON bytes. Wall time and whole-process peak RSS are diagnostics, not isolated FX CPU timings or Mongo memory. This is fresh-state full-turn performance and integration evidence, not an aged-world or long-horizon balance qualification. The separate 48-turn deterministic scenarios above cover controller sensitivity under frozen assumptions.

The replay captures the committed turn and its registered phase outcomes. Fire-and-forget post-commit work, including contests and integrity scans, is not awaited or qualified. Closing each short-lived replay client can therefore log an interrupted background request after a clean turn; those shutdown messages are distinct from phase failures.

Raw synthetic receipts, logs and the disposable harness stay outside source control under `E:/Program Projects/Codex/tmp/fx-intervention-replay`. A standalone full-world diagnostic was rejected because two unrelated election phases require transactions; standalone FX settlement is qualified separately by the real-Mongo integration tests. Temporary harness export/name-limit failures are not accepted as successful replay evidence.

## Final audited replay results

All four full turns committed cleanly, with no failed or aborted phases. US, UK and JP inactive-policy rates matched exactly. The funded case exercised buying and selling, did not overshoot either band edge, left no pending receipt and left no negative tested reserve pool.

| FX phase scenario | Baseline commands | Candidate commands | Baseline returned docs / bytes | Candidate returned docs / bytes |
| ----------------- | ----------------: | -----------------: | -----------------------------: | ------------------------------: |
| Inactive policy   |                38 |                 38 |                    95 / 36,847 |                     95 / 36,847 |
| Funded defence    |                41 |                 45 |                    95 / 36,048 |                     94 / 36,003 |

The funded case's net increase is four commands, with no added reads, below the unchanged 500-command FX budget. This qualifies the bounded receipt-write overhead, not a general turn-speed improvement.

| Whole-turn scenario | Baseline commands / returned bytes | Candidate commands / returned bytes | Baseline / candidate peak process RSS |
| ------------------- | ---------------------------------: | ----------------------------------: | ------------------------------------: |
| Inactive policy     |               29,377 / 269,881,476 |                29,365 / 269,741,064 |                 1,514.4 / 1,584.4 MiB |
| Funded defence      |               29,285 / 269,036,843 |                29,355 / 269,725,407 |                 1,567.3 / 1,474.0 MiB |

Whole-turn timings were 89.9 / 84.5 seconds for the control and 76.9 / 81.7 seconds for funded defence. Host load, GC and asynchronous work make those diagnostic only. Other phase counts and outcomes are not asserted to be bitwise identical. Both versions already exceeded existing budgets in corporation processing, banking, challenger generation and parliamentary government formation; no budgets were raised here.

| Funded country | Legacy reserve draw | Candidate reserve draw | Result                                                   |
| -------------- | ------------------: | ---------------------: | -------------------------------------------------------- |
| US             |      USD 750,659.19 |         USD 207,244.20 | Same rate correction                                     |
| UK             |      GBP 461,604.54 |         GBP 109,180.18 | Same rate correction                                     |
| JP             |    JPY 7,964,855.19 |       JPY 7,988,591.07 | Ends at 134.43275, not the legacy overshoot to 135.37365 |

The JP band is [134.43275, 134.56725]. Costs do not universally fall: the objective is useful, bounded movement rather than the legacy saturated pressure channel. The separate 48-turn narrow-band scenario measures the resulting reduction in repeated overshoot spending.

The audit additionally verified monotonic settlement claims and capped reconstructed debits at their stored pool balances. The latter prevents a false insufficient-balance rejection when, for example, `(0.01 / 0.29) * 0.29` rounds above 0.01. A grid of 891 balance/rate pairs and an actual guarded Mongo debit cover that regression. The final replay above was repeated after this fix.

## Verification record

- Final production build, typecheck, lint/format checks and architecture audit pass; persistence/reset contracts pass 173 tests.
- FX rules, turn and settlement checks pass 94 tests, including four owned standalone-Mongo integration cases.
- The broad CI suite completed with 55,545 passed, 558 skipped, one todo and one existing source-scan timeout under load. The timed-out autonomy scan passed its unchanged seven-test retry after the suite; the two broad source guards also passed together (11 tests). No assertion or timeout was weakened. This records the retry explicitly rather than claiming the original full-suite command exited successfully.
- No live database was read or changed. Long-horizon, aged-world and post-deployment observation remain separate qualification.
