# Turn-engine benchmark and parity harness

Runs one turn on the v1 engine and the same turn on the v2 engine, each from an
identical restored copy of the same database snapshot, and compares what they
produced.

This is the evidence behind `src/simulation/engine/CHANGELOG.md`. It is not a
unit test: it needs two restored production-sized copies and takes as long as
two turns, so it runs on demand, never in CI.

## What it runs

```
scripts/turn-engine/bench.ts        orchestrates the two runs and compares them
scripts/turn-engine/run-turn.ts     spawned once per engine; runs one turn
scripts/turn-engine/lib.ts          canonicalisation, money totals, trial balance
```

`run-turn.ts` is a separate process per engine because the app's Mongo client is
a process-wide singleton. It pins the clock the turn sees: the producer shadow
reads wall-clock time, so two runs of the same turn minutes apart produce
different spend even when nothing else differs. The pinned instant is derived
from the snapshot (`lastTurnProcessed + turnLengthMinutes`), so both copies see
the same one without an arbitrary constant. Pass `--clock-ms` to override or
`--no-freeze-clock` to disable. Each child:

1. refuses a non-local URI, and refuses a copy that still holds a turn lock;
2. sets `gameConfig.turnEngineVersion` (`v1` unsets it, so v1 runs the default
   path every live world is on today; `v2` sets `"v2"`);
3. opens a change stream so every document the turn writes is recorded;
4. runs exactly one turn through `processTurn()`;
5. records per-phase time and round trips, every written document, per-currency
   money totals and the turn's trial balance.

The parent refuses to compare copies that are not at the same turn boundary,
runs the engines sequentially (so they do not share CPU), and fails when there
is any document difference, any money-total difference, any red trial balance or
any timed-out phase.

## Preparing the copies

Both copies must be byte-identical restorations of one snapshot, stopped, and
started as single-node replica sets (the harness uses change streams). Use
different ports for the two copies.

Before running, **scrub the copy** the same way any engine code run on restored
data must be scrubbed: unset `discordGameWebhookUrl`,
`discordCountryGameWebhookUrls`, `discordNewsWebhookUrl`,
`discordChangelogWebhookUrl` and `discordSuggestionsWebhookUrl` on
`gameConfig`, set `discordWebhookOwnerService` to a value that cannot match a
deployment, and set `simSandbox: true` so the cron-drift guard does not pause
the world. Run the children with `DISABLE_DEV_BACKGROUND=1`.

A copy cloned from another `dbpath` also carries that host's replica-set config
in its `local` database. Start it once without `--replSet`, drop `local`, stop
it, then start it with `--replSet <name>` and `rs.initiate` for its own port.

## Running

```
npx tsx scripts/turn-engine/bench.ts \
  --v1-uri mongodb://127.0.0.1:27051/a-house-divided \
  --v2-uri mongodb://127.0.0.1:27042/a-house-divided \
  --out /tmp/turn-engine-bench
```

Options:

| flag                   | default  | meaning                                                         |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `--v1-uri`, `--v2-uri` | required | local Mongo URIs, same starting world                           |
| `--out`                | required | directory for `v1.json.gz`, `v2.json.gz`, `summary.json`        |
| `--settle-ms`          | `4000`   | wait after the turn for fire-and-forget writes to land          |
| `--trace`              | off      | comma-separated collections to count driver calls per call site |
| `--control`            | off      | run v1 on BOTH copies: measures the turn's own nondeterminism   |

Results are written to `--out` and **must not be committed**: they contain the
world's documents, including player data.

`run-turn.ts` raises `TURN_PHASE_TIMEOUT_MS` to 30 minutes for the run. A
restored copy on a busy box runs with cold caches and a change stream attached,
and the production 4-minute phase budget can trip on work that fits inside it on
the real host; a timed-out phase commits part of its work, which would turn the
comparison into noise.

## What "parity" means here

For every collection either engine wrote:

- **update/replace**: matched by `_id`, compared field by field on the final
  document;
- **insert**: compared as a multiset of canonical documents with `_id` removed,
  because two engines generate different ObjectIds for the same new document;
- **delete**: compared as a set of `_id`s.

A document is canonicalised by sorting keys, turning Dates into ISO strings and
rounding numbers to six decimals (float noise, not a decision).

Ignored fields, and why:

| scope             | fields                                                                                                                                                                                                                                      | why                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| every collection  | `createdAt`, `updatedAt`                                                                                                                                                                                                                    | wall-clock stamps; no game decision reads them                                              |
| `gameState`       | `processingStartedAt`, `processingHeartbeatAt`, `processingPhase`, `processingPhaseStatuses`, `processingPhaseResults`, `processingTargetTurn`, `processingEngine`, `processingEngineVersion`, `processingAbandonedAt`, `nextScheduledTurn` | the in-flight turn block: heartbeats, phase status, lock and the engine stamp itself        |
| `savingsAccounts` | `lastSettlementKey`, `settledKeys`, `settlementProjectionRevision`                                                                                                                                                                          | idempotency bookkeeping keyed by per-run move ids; balances and interest are still compared |
| `bankMoneyMoves`  | `settlementKey`                                                                                                                                                                                                                             | same                                                                                        |

Collections that are pure telemetry are not captured at all: `actionAuditLog`,
`apiAccessLog`, `analyticsRecords`, `turnLogs`, `postTurnScans`,
`serverMetrics`.

Money invariants:

- **trial balance**: every `ledgerEntries` row for the turn must net to zero
  across its legs (tolerance ₳0.01), computed directly from the ledger rather
  than trusting the game's own reconcile phase, which can be flag-gated off;
- **per-currency totals** of `cash` (character personal balances + corporate
  liquid capital), `deposits` (`savingsAccounts`), `loans` (`bankLoans`
  outstanding), `bonds` (`totalIssued` unmatured) and `treasury`
  (`federalBudget` sovereign cash) must match between the engines.

## The control run

`--control` runs v1 on both copies. Its diff is the floor: a turn is not
perfectly deterministic even with `Math.random()` seeded (fire-and-forget
writes land in different orders, and runtime ObjectIds are generated from a
process-unique value). Any v1-vs-v2 diff has to be read against that floor.
Runtime ids are masked on both sides before diffing except for that reason, so
the control normally reports zero differences outside the fields listed above.

## Reading the numbers

Round trips are the metric that transfers to production, because production
turn time is round trips × remote latency. Local wall time is dominated by CPU
and BSON deserialisation, so a phase can be much faster locally than in
production, and a round-trip cut can show almost no local seconds. The summary
reports both; the engine changelog quotes both and says which one the production
estimate is derived from.
