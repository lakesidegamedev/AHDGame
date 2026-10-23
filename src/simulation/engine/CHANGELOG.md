# Turn engine changelog

The hourly turn engine is versioned separately from the app.

- `gameConfig.turnEngineVersion` selects the engine: `"v1"` or `"v2"`.
  Absent means `"v1"`, which is the default on every world.
- `TURN_ENGINE_VERSIONS` in [`turnEngine.ts`](./turnEngine.ts) holds each
  engine's behaviour version. `v2` starts at `2.0.0`.
- Every turn stamps the engine and its version on the in-flight `gameState`
  document, on `turnLogs.engineVersion`, and on `turnLogs.build.engineVersion`.
- The selection is read once, at turn start. A crashed turn resumes on the
  engine that started it: config chooses the next turn's engine, never the
  engine of a turn already in progress.
- v2 reuses the phase registry, runtime, phase names, resume codecs and crash
  recovery unchanged. It swaps in an optimized implementation per phase; any
  phase without one runs its v1 code.

A version is bumped when a v2 phase changes the code that produces the world.
It is not tied to the app release: switching engines is a config change with no
deploy, and the turn log has to answer _which rules produced this world_.

## v1 — 1.0.0 (baseline)

Measured on one turn of a full restored production copy (turn 373 of the
2026-10-22 US world; 42.5M documents), with `TURN_PHASE_TIMEOUT_MS` raised so no
phase could time out mid-turn. Production's own turn at the time was ~807s and
43,769 round trips; the local copy is faster per round trip (Mongo on the same
host) and slower per document (cold cache, one process), so **round trips are
the number that transfers**, and the local seconds are quoted only beside them.

| phase             | round trips | local seconds |
| ----------------- | ----------: | ------------: |
| bankingTurn       |      17,075 |          77.5 |
| corporationTurn   |       8,801 |         273.3 |
| indexFunds        |       6,096 |          37.7 |
| treasuryTurn      |       2,081 |          36.1 |
| bondTurn          |         409 |          65.6 |
| every other phase |      10,377 |          92.6 |
| **whole turn**    |  **44,839** |     **582.0** |

The trial balance for the turn was green (0 unbalanced entries, 54,623 entries)
and every per-currency money total was recorded as the reference.

Where corporationTurn's share goes (its own substeps): `developmentCash` 3,073
round trips, `operatingCashSettlement` 1,924, `sector+corp bulkWrites` 705,
`nppSupplyAgreements` 480, `marketContext` 438, `nppCorpDecisions` 218. The last
one is **116s of CPU on 218 round trips** — the NPP decision brain, not the
database. bankingTurn's 17k is almost entirely `depositTakers` (14,445), and
indexFunds' is `pass3-rebalance` (3,056) plus `pass3c-redemptions` (1,766).

## v2.0.0 — 2026-10-23

### What changed

**corporationTurn** — the NPP relocation-bond credit fan is preloaded once for
the decision cohort instead of read per corporation. v1 resolves six reads per
credit-taking corporation (`bonds` twice, `corporateSectors`,
`corporationHistory`, `gameConfig` for the market mode, `gameState` and the
world era scale) and inserts the bond immediately. v2 computes the same
pre-flight from one cohort read of each collection, reuses the sector map and
the creditor-bond map the decision pass already holds, and lands every issued
bond in one ordered `insertMany`. The decision math is a line-for-line mirror of
`previewRelocationBond`/`issueRelocationBond`, deliberately kept separate so the
parity run compares v1's untouched code against it. Manufacturing product
projects also go in through one unordered `bulkWrite` instead of one insert per
project.

**bankingTurn** — three reads that are uniform for the whole pass are loaded
once instead of per bank: each deposit taker's financial sectors (one `$in`
query for the deposit ceiling instead of one query per bank), the turn's
transaction-log thresholds and cadence, and borrower display names (one read
per bank instead of one per paid loan). The settlement journal itself is
untouched.

**indexFunds** — the bid loop reuses the turn's transaction-log thresholds and
cadence, which the cron already loaded at the top of the run, instead of
re-reading both for every bid.

### Measured effect

Same copy, same turn, both engines:

| phase           | v1 round trips | v2 round trips |      v1 s |      v2 s |
| --------------- | -------------: | -------------: | --------: | --------: |
| corporationTurn |          8,801 |          8,706 |     273.3 |     261.8 |
| bankingTurn     |         17,075 |         17,068 |      77.5 |      90.3 |
| indexFunds      |          6,096 |          6,050 |      37.7 |      37.4 |
| **whole turn**  |     **44,839** |     **44,693** | **582.0** | **588.9** |

**v2 removes 0.3% of the turn's round trips.** That is the honest result: the
three phases above were optimized, they are at parity, and they do not move the
turn, because the cost is not in their reads. The local wall-clock difference is
inside run-to-run noise (±1.5%) and is not evidence of anything.

### Parity evidence

`scripts/turn-engine/bench.ts` runs one turn per engine from two restorations of
the same snapshot and compares every document either engine wrote: updates by
`_id` field by field, inserts as a canonical multiset with `_id` removed,
deletes as a set. It also compares per-currency cash, deposit, loan, bond and
treasury totals, and computes the turn's trial balance directly from
`ledgerEntries`.

The turn is not perfectly deterministic on its own: `Math.random()` is still
used by a few phases, and runtime ids are embedded in documents. The harness
seeds `Math.random` identically in both runs, masks ids that exist in only one
run (a runtime id by definition), and normalises the runtime UUIDs that
settlement keys embed. A `--control` run executes **v1 on both copies**; its
diff is the floor against which v1-vs-v2 is read.

See the run's `summary.json` for the exact collections compared and every
remaining difference, and the PR body for the numbers from the final pair.

### What v2 does not change

- Phase order, phase names, resume codecs, crash recovery, retry semantics.
- Any money movement or game rule. The settlement journal runs exactly the same
  commands in exactly the same order.
- The engine of a turn already in progress. A resumed v1 turn stays v1 even if
  config was flipped to v2 before the resume.

### Remaining bottlenecks (the work needed for 5x)

Call-site trace of one v1 turn, counted per turn. Every entry below is inside
the settlement journal (`src/lib/banking/moneyMove.ts` and
`projectionSettlement.ts`), which is the crash-safe, exactly-once money-move
protocol every phase uses:

| commands / turn | call site                     | what it is                                 |
| --------------: | ----------------------------- | ------------------------------------------ |
|           2,133 | `moneyMove.ts:515`            | acknowledge one leg                        |
|           2,122 | `moneyMove.ts:580`            | replay read of the move record, per leg    |
|           1,639 | `projectionSettlement.ts:151` | acknowledge one projection                 |
|           1,145 | `moneyMove.ts:643`            | apply one leg to its target document       |
|           1,140 | `moneyMove.ts:539`            | clear the leg receipt from the target      |
|             938 | `moneyMove.ts:323`            | complete the move                          |
|             931 | `moneyMove.ts:285`            | claim the move                             |
|             630 | `projectionSettlement.ts:201` | replay read of the journal, per projection |

That is ~10.7k of the turn's 44.8k round trips from eight sites, all of them
per-leg or per-projection guarded writes whose purpose is restartability: a
crash between any two writes must leave a visible partial that a later turn can
finish exactly once. Getting to 5x means changing that protocol — batching the
claim/ack writes of independent moves, or running a phase's whole settlement in
one transaction and skipping the per-leg guards inside it. That is a project of
its own with its own parity harness, not a read-batching change, and it is the
reason this entry ships a measured 0.3% rather than a claimed 5x.

The next-largest items after the journal are `nppCorpDecisions` (CPU, not round
trips: 116s for 218 commands), `developmentCash` (3,073 commands, also journal),
and `pass3-rebalance` (3,056, fund trades and their journal rows).

## Reproducing

See `scripts/turn-engine/README.md`. Results contain the world's documents and
must stay outside the repository.
