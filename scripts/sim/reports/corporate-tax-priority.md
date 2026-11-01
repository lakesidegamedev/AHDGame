# Corporate withholding and arrears priority

Issue-first waived by the user. Synthetic data only; no production changes.

## Behavior

Positive funded-market receipts for private corporations remain in `pendingOperatingCash` until settlement. Current federal tax is reserved first, followed by current non-tax operating costs, old federal tax arrears, old operating arrears, and optional household distributions. Tax and operating shortfalls remain liabilities and receive partial collection on subsequent settlements. Corporate dividend receipts use the same priority with a separate retry key. Existing regional-tax accrual calculations and statutory obligations are retained.

Each batch of up to 64 corporations applies cash, debt counters, Treasury receipts, household distributions, ledger witnesses and recovery receipts in a required Mongo transaction. Interrupted legacy journal settlements retain their recovery protocol. Optional purchases, expansion, retooling, acquisitions, buybacks and ordinary overhead budgets cannot jump ahead of known payables. Legacy automatic growth pauses while those payables remain; physical plant operations continue.

Held cash remains part of ledger balances and money supply. It is embedded in corporations, which are wiped by world and economy resets. Worlds without Treasury cash accounting retain their existing producer settlement behavior. Optional CEO and shareholder payouts also exclude already-settled producer profit and reserve cash for current tax; unreceived bond coupons cannot fund a distribution that would leave that tax uncovered.

## Simulation

Run `npx tsx scripts/sim/corporateTaxPrioritySimulation.ts`.

All 29 country/currency mappings pass the same 48-turn scenario: 100 anchor operating profit each turn, 30 current tax, 250 initial tax arrears, 50 initial operating arrears, and an optional 60 household distribution per turn. Debts clear on turn 5. Over 48 turns, tax collection is 1,690, household distributions 2,630, ending spendable cash 430, and old operating obligations paid 50. Their sum equals 4,800 of operating receipts. No optional distribution occurs while arrears remain. A cash-shortfall scenario preserves 10 of unpaid current tax and 30 of operating debt instead of forgiving them.

This tests payment ordering and conservation, not full-world economic outcomes.

## Performance and validation

The in-memory 480-corporation debt fixture uses 27,547 collection commands under the prior per-corporation arrears recovery path and 50 under the batched tax-first path. The new corporation projections total an estimated 64,320 BSON bytes. The test driver does not apply find projections itself, so the byte estimate applies the actual declared Mongo projection to the fixture documents. Native Mongo transaction and full-world performance replay have not been run.

The combined affected regression pass contains 522 passing tests across 33 suites, including rollback injection after cash, Treasury, ledger and receipt writes; US/UK/JP currency settlement; source-specific replay; held funded receipts; multiple household recipients; and existing personal withholding. A further 41 passing tests cover turn orchestration, operating cash, parent subsidies and performance (the performance suite overlaps the combined pass).

Lint, changed-file type-check and blocking architecture checks pass. Lifecycle contracts passed 183 tests initially; the remaining discovery check passed after explicitly reviewing the unchanged acquisition collection targets and its added cash eligibility predicate. The dynamic-site fingerprint was updated individually, with the lifecycle/recovery reason documented.

Final payout coverage: 140 tests pass, including the full calculation path with profitable forecast coupons but no cash coverage for current withholding. Configured CEO salary is retained during an arrears pause. Relocation and source-settlement focused checks also pass (27 tests, overlapping the earlier cohorts).

Final transaction audit: the shared withholding context loader serializes reads on a Mongo transaction session. Its regression also verifies that standalone reads retain parallel loading. The affected audit pass contains 618 passing tests, including all 585 transaction-matrix cases and both previously interrupted broad-suite tests. Five rename-route integration cases pass separately.

Dividend allocation audit: synthetic stale IPO inventory is bounded by outstanding unheld float, and combined direct-holder plus equity-pool distributions cannot exceed the corporate payout pool. Share restructuring rejects an unfinished issuance before market cleanup, rechecks the fresh document, and requires an atomic no-pending-issuance before-image. All 926 focused tests pass, including 145 allocation scenarios across 29 country/currency mappings, restructuring concurrency cases, sector-level payout regression and all 585 withholding transaction cases. No production balances were changed.

Final broad-suite audit: all four CI test shards completed, with 60,007 passing tests in the initial shard results. The 12 failures were resolved: atomic-debit fixtures now return matchedCount, historical loss-wave tests explicitly exercise the retained recovery protocol, the mandatory-fine mock includes the obligation option, and legacy journal probes use indexed literal prefixes. All six affected regression suites then pass (48 tests). The dividend/withholding focused pass has 926 passing tests. All changed TypeScript files and their imports pass the scoped strict type-check, changed-file lint passes, architecture reports zero blockers (67 existing warnings), and all 185 reset/persistence contracts pass.

Validation limits: full-project TypeScript exhausted the deliberately capped 3 GB heap; the repository's 12 GB default was not used to avoid excessive local resource use. The standard build initially could not resolve the shared dependency junction. Dependencies were copied locally without changing versions, and the retry was stopped at the user's request to skip the build. The production build is not qualified by this audit. Native Mongo and full-world replay remain outside the synthetic evidence above.
