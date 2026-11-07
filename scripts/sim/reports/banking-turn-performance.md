# Banking turn read optimization

## Scope

Same `codex/producer-market-performance` worktree, based on development
`4f9dba212d`. This supplements the market receipt and clearing work in
`producer-market-performance.md`.

Banking now uses the existing cohort-read path by default, with an explicit
`batchPerBankReads: false` reference path for tests. Financial-sector capacity,
era scale and transaction-log thresholds are read once per turn. Empty sector
cohorts are cached too. Mutable balances, bank charters and loan servicing stay
inside the existing keyed locks; journal and idempotency behavior are unchanged.

NPC maintenance loads HQ states, existing seed keys and legal charter types in
cohorts. It still checks eligibility every turn and uses the actual spawn and
charter paths for missing banks. Capital requirements are loaded only when a
bank is missing, once per currency. Rate-corridor lookups are reused per country
within the maintenance pass. Rate changes still use their normal validation.

## Bounded replay

Run sequentially on one pinned CPU at BelowNormal priority with a 512 MiB heap:

```powershell
node --max-old-space-size=512 node_modules/tsx/dist/cli.mjs scripts/sim/bankingTurnReads.ts
```

The synthetic world includes all 29 supported country IDs, enacted US/UK charter
overrides, and command-economy gating. Results are compared with deep equality
against the scalar eligibility implementation.

| World year | Countries | Scalar lookup reads | Cohort lookup reads | Results   |
| ---------- | --------: | ------------------: | ------------------: | --------- |
| 1991       |        29 |                 106 |                   3 | Identical |
| 2019       |        29 |                 114 |                   3 | Identical |

These are lookup API counts, including concurrent reads individually. They are
not whole-turn round-trip measurements or timing forecasts. No production-sized
BSON byte profile was run for this banking change.

## Index deployment

One shared non-unique plan is used by bootstrap and the existing-world installer:

- `corporations`: sparse `npcBankSeedKey` lookup.
- `characters`: scoped wildcard on `currencyBalances.savingsHolder`, covering
  current and future currencies without one index per currency.
- `bankLoans`: `bankCorporationId`, `status`, `borrowerType`, `lastProcessedTurn`.

The prior read-only production investigation found collection scans on these
lookup shapes. Indexes have not been applied to production. Use the normal
`MONGODB_URI` migration environment; the installer defaults to dry run:

```powershell
npx tsx scripts/migrations/2026-11-07-banking-turn-read-indexes.ts
# Only during an approved index deployment:
npx tsx scripts/migrations/2026-11-07-banking-turn-read-indexes.ts --apply
```

No balance/schema data is migrated. Real Mongo query-planner verification of
the new indexes remains a deployment check; the in-memory harness cannot prove
index selection or index build cost.

## Qualification boundary

Banking's 20 contract scenarios run in scalar, cohort and default modes (60
tests), covering repayments, deposit ceilings, money conservation, retries and
idempotency. NPC tests include real charter issuance through a synthetic stateful
database, cohort/scalar repeat-run equivalence, existing-bank preservation and
eligibility. Banking integration scenarios cover loan lifecycle, charters,
interbank income, counters and audit behavior.

The existing index-fund round-trip tests now run with `reuseRebalanceReads` both
off and on, preserving their financial and query-budget assertions. This is
focused qualification, not proof of whole-engine document parity. No live v2
switch was changed. Promoting the entire v2 engine, including its relocation
credit path, still requires `scripts/turn-engine/bench.ts` on two identical local
replica-set copies. Those copies were not prepared or run during this bounded
investigation.

Full-project typecheck/build remain unverified locally: the earlier broad
typecheck exceeded the agreed memory ceiling. Do not increase local resource
limits to infer success. CI must complete those checks before merge.

## Verification results

- 154 targeted tests passed: 60 banking contract scenarios, 10 NPC bank tests,
  46 banking integration/index-fund tests, and 38 architecture/index/migration/
  eligibility checks. Repeated preliminary runs are not added to this count.
- The architecture audit completed with zero blocking findings and 71 existing
  warnings. Bootstrap index coverage and turn-read projection checks passed.
- Changed-file ESLint, Prettier and `git diff --check` passed.
- Checks ran sequentially on one pinned CPU at BelowNormal priority with a
  768 MiB test heap. No live writes, whole-world clones, build or v2 promotion.
