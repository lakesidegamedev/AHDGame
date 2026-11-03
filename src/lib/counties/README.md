# County population stocks

US counties persist in `counties`, keyed by the map's five-digit FIPS. Initialization
selects a Census population snapshot for the requested reset preset:

| Preset | Population year                                | Counties with compatible historical data |
| ------ | ---------------------------------------------- | ---------------------------------------- |
| 1953   | 1950 Census                                    | 2,651                                    |
| 1979   | 1979 annual estimate                           | 2,988                                    |
| 1991   | 1991 intercensal estimate                      | 3,049                                    |
| 1999   | 1999 intercensal estimate                      | 3,049                                    |
| 2007   | 2007 annual estimate, Vintage 2009             | 3,142                                    |
| 2019   | 2019 annual estimate, Vintage 2019             | 3,142                                    |
| 2023   | 2023 annual estimate, Vintage 2025             | 3,134                                    |
| 2027   | 2025 annual estimate, latest completed vintage | 3,134                                    |

`src/lib/countries/us/data/countyPopulationHistory.json` records source URLs,
raw-input SHA-256 hashes, selected fields, coverage and every fallback state's
missing/extra FIPS. The 1950 table was authored by the Census Bureau and is
retrieved from NBER's mirror of the original Census text. The 1979 series is
preliminary and rounded as published. The 1991/1999 totals sum all 304 disjoint
age/race-sex/origin cells per county. Annual CSV inputs validate official state
checksums. Rebuild with `tsx scripts/geo/build-county-population-history.ts <input-directory>`;
input filenames are recorded in the artifact and the builder. Use raw downloaded
files, extracting `e7079co.txt` from the Census ZIP for 1979.

Whole-entity renames and mergers follow Census county-change notices. The map
keeps its existing county geography. If a state's historical roster cannot be
reconciled completely, that entire state retains proportional 2019 weights;
raw counts from different years are never mixed. This deliberately avoids
inventing a historical population split for a later-created county. Minor
boundary changes that retain county identities are not reconstructed.
Connecticut's newer planning regions cannot be mapped to the old eight-county
map and use the fallback for 2023/2027. Alaska, Colorado and other historical
roster gaps are listed explicitly in the artifact.

The proportional fallback is Census Vintage 2019 `POPESTIMATE2019`, which matches
all 3,142 committed county geometries. `src/data/county-population-source.json`
records its provenance and official state checksums. Unknown/empty preset aliases
retain the existing 2019 fallback behavior.

At initialization, exact largest-remainder apportionment scales reference weights
to each existing state's population. State and country totals do not change. Non-reset reference reseeds preserve
existing state populations; resetting a world remains an explicit bootstrap operation.
`baselinePopulation` records the selected raw reference weight and
`populationBaseline` identifies its Census year (or the 2019 fallback), while
`population` is gameplay state. Bootstrap passes its requested preset explicitly;
standalone initialization reads the saved preset. Existing county populations and
baselines are preserved on non-reset initialization, including already-migrated
live worlds. A normal reset rebuilds them automatically without rerunning the held
migration. Reference-only bootstrap refreshes preserve existing stocks unless
`resetReference` explicitly requests replacing the state/reference populations. Geography and PVI remain in the existing map files.

The existing regional cohort engine calculates births, deaths, migration and
conflict effects. Their realized net population change is allocated among current
county stocks proportionally, with FIPS tie breaks. Positive changes never reduce
a county; losses never make one negative. Individual zero-population counties receive no proportional growth while their
state remains populated. A completely empty state uses its persisted initialization
baseline when receiving people again, so a new data release does not silently
change its historical distribution. Legacy records without a stored baseline
retain the original 2019 fallback. No independent county age/sex distribution is fabricated.

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

The isolated real-Mongo run rebuilt all eight presets over prior-world county stocks.
The 48-turn all-county run preserved all 51 state sums and country totals.
The matched journal replay preserved regional cohort vectors, population readouts
and metrics: baseline 17 commands / 133,859 reply BSON bytes; candidate 25 commands /
1,343,375 bytes. The first full demographic phase used 37 commands / 1,472,109 reply
bytes, below its existing 600-command budget. These are synthetic local-world
measurements, not production latency or a whole-economy balance qualification.

Inactive general and primary county maps use the committed reference weights,
matching the existing reconstructed-results model. Active races and office placement
use persisted populations. This keeps historical maps stable as current stocks change;
it does not claim archived, independently counted county ballots.

## UK constituencies and Japanese prefectures

The same `counties` collection and demographic receipt protocol also hold 650 UK
constituencies (ONS IDs such as `E14001073`) and 47 Japanese prefectures (prefixed
IDs such as `JP-13`). The existing compound country/state index serves all three
countries; US FIPS and old frozen receipts remain compatible. Names in the UI
remain Constituency/Constituencies and Prefecture/Prefectures.

UK initializes from complete 2024 constituency electorate weights in the
committed map files (`populationBaseline: uk-electorate-2024-proportional`). These
are a proportional fallback, not measured resident populations or reconstructed
historical constituencies. Japan initializes from the directory's approximate
2020 prefecture population weights (`jp-reference-2020-proportional`). Every
preset scales those weights to its own authored region totals. No historical
UK/JP subdivision population series is supplied by this change.

UK/JP reference region reseeds preserve live regional populations. World resets
replace subdivision stocks after seeding the requested era's regions. Realized
net births, deaths, migration and conflict losses follow the same proportional
allocation, zero-population recovery and frozen receipt replay as US counties.
Regional age/sex vectors remain authoritative for demographics; no independent
subdivision cohorts are invented.

`scripts/geo/build-jp-subdivisions.ts` reproducibly builds eight prefecture map
shards from the committed 47-prefecture topology and country directory, offline.
Japan uses distributed vote estimates, with neutral lean where no prefecture
political baseline is authored. These polygons do not claim statutory district
results or a one-prefecture/one-seat allocation. Active UK/JP maps read persisted
populations; concluded maps retain committed weights so future turns do not
change an old result.

Hosted rollout requires the held migration
`2026-11-01-uk-jp-subdivision-populations` before resuming turns on this build.
Pause population writers, finish any ready demographic receipts, back up, dry-run,
apply with `--only`, then dry-run again. The original US migration stays US-only.
The new migration inserts missing UK/JP records without changing existing stocks
or parent populations. A partially populated, inconsistent region fails closed.
Singleplayer startup includes the new migration automatically; new worlds get
these stocks from bootstrap and stamp the migration baseline.

When a UK region secedes into a different region roster, its Westminster
constituency stocks retire with the aggregate inside the secession transaction.
A region transferred out of the UK likewise retires that UK-specific layer; its
people remain conserved by the transferred state/cohort populations. Independent
Scotland/Wales and Ireland are not added to this subdivision system. Acquired
regions outside a country's committed map roster do not acquire invented map
subdivisions during bootstrap or demographic processing.

Singleplayer startup resumes current-world frozen demographic receipts through
the next turn before running migrations. It finishes the original outcomes
without recomputing demographics, then initializes new stocks against those
recovered regional totals. A recovery failure leaves migration markers pending
and still runs required startup repairs. Hosted migration behavior is unchanged:
operators must finish pending receipts explicitly.
