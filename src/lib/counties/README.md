# County population stocks

US counties persist in `counties`, keyed by the map's five-digit FIPS. The source
is Census Bureau Vintage 2019 `POPESTIMATE2019`, which matches all 3,142 committed
county geometries. `src/data/county-population-source.json` records provenance,
source hash and official state checksums. The reference is a dated initialization
weight, not a modern population to copy into historical worlds. It does not claim
historically precise county shares for every world preset.

At initialization, exact largest-remainder apportionment scales reference weights
to each existing state's population. State and country totals do not change. Non-reset reference reseeds preserve
existing state populations; resetting a world remains an explicit bootstrap operation.
`baselinePopulation` records the reference weight, while `population` is gameplay
state. Geography and PVI remain in the existing map files.

The existing regional cohort engine calculates births, deaths, migration and
conflict effects. Their realized net population change is allocated among current
county stocks proportionally, with FIPS tie breaks. Positive changes never reduce
a county; losses never make one negative. Individual zero-population counties receive no proportional growth while their
state remains populated. A completely empty state uses its documented baseline
weights when receiving people again. No independent county age/sex distribution is fabricated.

County outcomes are frozen in the existing demographic projections before a
receipt is published. Recovery writes absolute county stocks with the same
world/turn/batch stamps as state and cohort projections. Counties are confirmed
before state population is written from their frozen sum. A partially materialized
receipt can temporarily expose county/state disagreement, as the existing journal
can expose disagreement among cohort/state stores. Pending receipt recovery must
finish before the next turn context loads. This is recoverable publication, not an
atomic cross-collection snapshot for concurrent readers.

## Deploy and reset

1. Pause every turn worker and population writer. Finish pending demographic
   receipts using the old build before initializing counties.
2. Back up the world, deploy the candidate and run the migration framework's dry
   run with `npm run migrate:dry-run -- --only=2026-10-30-county-populations`.
   This is a held migration, excluded from automatic startup runs. Review it, then
   apply with `npm run migrate -- --only=2026-10-30-county-populations` while
   writers remain paused.
3. Verify all US states have their complete county roster and county populations
   sum to `states.population`. Resume writers only after migration succeeds.

The migration runner uses `MONGODB_URI`. Configure it for the intended paused
world; it does not automatically select `MONGODB_URI_LIVE`.

The migration refuses unfinished receipts, inserts missing records without
replacing existing stocks and creates `counties_country_state`. A rerun after a
partial insertion is safe while writers remain paused. New turns fail closed on
missing coverage or an inconsistent existing rollup. Maps require initialized
county stocks. Rollback must pause writers and restore a consistent world backup,
or use an older build that ignores counties; do not run old population writers
alongside the new system.

Bootstrap replaces county stocks after all state populations and cohorts are
initialized, clearing previous-world flow stamps. The seed manifest classifies
counties as reference data with mutable runtime stocks. Bootstrap's core indexes
restore the country/state lookup independently of migration markers.

## Qualification

`src/lib/counties` tests cover source checksums, exact conservation, migration,
reset, growth/decline and partial-write recovery. The opt-in isolated Mongo suite
in `scripts/sim/countyPopulations.mongo.test.ts` exercises the real demographic
phase, replay and fault recovery without any configured database URI. Its JSON
receipt is written only when `AHD_COUNTY_QUALIFICATION_OUT` is supplied. This is
bounded population qualification, not a full economy or election balance trial.

The schema/new-mechanic issue prerequisite was waived by the repository owner for
this task after the GitHub integration rejected issue creation.

## Measured bounded evidence

The isolated 48-turn all-county run preserved all 51 state sums and country totals.
The matched journal replay preserved regional cohort vectors, population readouts
and metrics: baseline 17 commands / 133,859 reply BSON bytes; candidate 25 commands /
1,267,967 bytes. The first full demographic phase used 37 commands / 1,396,701 reply
bytes, below its existing 600-command budget. These are synthetic local-world
measurements, not production latency or a whole-economy balance qualification.

Inactive general and primary county maps use the committed reference weights,
matching the existing reconstructed-results model. Active races and office placement
use persisted populations. This keeps historical maps stable as current stocks change;
it does not claim archived, independently counted county ballots.
