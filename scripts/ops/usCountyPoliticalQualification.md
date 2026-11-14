# US geographic budget and resident-coverage qualification

This workflow observes an explicitly selected world and qualifies public
reference data. It never bootstraps, migrates, resets or advances the database.
Restarting a stopped local Mongo service is a separate operator action.

Keep snapshots and generated reports under the task's external directory:

```powershell
python -B scripts/geo/qualify-ca-congressional-population.py --inputs "E:\Program Projects\Codex\tmp\county-political-leans-prototype" --out "E:\Program Projects\Codex\tmp\county-political-leans-prototype\ca-population-qualification.json"
npx tsx scripts/ops/usCountyPoliticalQualification.ts --mongo-key MONGODB_URI --population-report "E:\Program Projects\Codex\tmp\county-political-leans-prototype\ca-population-qualification.json" --out "E:\Program Projects\Codex\tmp\county-political-leans-prototype\local-budget-qualification.json"
npx tsx scripts/sim/usCampaignTimeline.ts --inputs "E:\Program Projects\Codex\tmp\county-political-leans-prototype" --population-report "E:\Program Projects\Codex\tmp\county-political-leans-prototype\ca-population-qualification.json" --out "E:\Program Projects\Codex\tmp\county-political-leans-prototype\population-priced-timeline.json"
```

## Read-only world observation

The collector uses `.env.local` without printing values. `--env-file` can select
another existing file. `MONGODB_URI` is the default; `MONGODB_URI_LIVE` must be
selected explicitly and is never a fallback. The URI is never in the report.
The collector opens the driver directly, disables retryable writes and only
issues projected reads and bounded aggregations. It does not call application
startup, index, seed or migration helpers. Command names are counted; unexpected
non-read commands cause failure. Errors suppress connection/document details.

Report fields are aggregates only. Account identifiers and activity dates are
used in memory by the existing `activeUserIds` helper to reproduce the PS-cap
membership rule; they are never exported. No party names or identities, player
documents or credentials are saved. The report distinguishes all voting-state
rows from those with active homed player members, reserves from configured PS
investment, and one/two-action affordability at observed pressure.

A ledger `stateId` is a geography, not a payer-scope field. Do not classify all
geographically tagged spending as state-pool consumption: nationally targeted
actions can share that field. The report exports grouped source/action totals
and states this limitation. It records the world preset and turn before/after;
matching turns are a consistency check, not an atomic snapshot guarantee.

A local or historical world does not establish production budgets or modern
player behavior. Zero persisted counties means that world's resident pricing
is unqualified, even when the public reference source passes all checks.
Do not seed a current world merely to make the audit pass. Prepare and qualify
the lifecycle separately, using the intended preset and migration policy.

## California reference inputs

Download the source URLs recorded in the Python program into the input directory:

- `ca-ab604-blocks.csv`: official chaptered AB 604 block assignment CSV from
  the California Senate, not the replaced initial proposal.
- `ca-ab604-redistricting.zip`: the official plan ZIP, with the same CSV and
  district-level population DBF. Its CSV must match the direct download exactly.
- `ca2020.pl.zip`: raw Census 2020 California P.L. 94-171 data from Census.gov.
- `ca-official-population/cd01.html` through `cd52.html`: district census
  reports from the Senate Office of Demographics. CD43's actual URL ends
  in `congressional-district-43-2025-0`; others use the normal district slug.
- `ca-presidential-parts.csv`: the same frozen presidential overlap source used
  by the original election prototype. Its overlap roster must match the plan.

The Census geographic file is pipe-delimited Latin-1. The importer checks the
`PLST|CA` schema, block GEOID against GEOCODE, unique block identities, complete
assignment coverage and the published California resident checksum. It joins
all 519,723 blocks to the official plan, yielding 58 counties, 52 districts and
144 overlaps. Census raw residents sum to 39,538,223.

The Senate web tables use adjusted redistricting population. Their district
totals agree with the official DBF, but 46 county-row sums differ from those
district totals by up to nine people. Those discrepancies are retained as
diagnostics. The county table counts are **not** used as weights or silently
repaired. Raw Census block residents provide exact overlap weights instead.
Raw and adjusted population totals are different denominators.

The importer scales within each county to the committed 2025 county weights
used by `2027-default` and checks their sum against the actual California
state seed (39,355,309). It also checks zero, one-person and large synthetic
state totals. Each scale preserves integer county/state stocks. These are
reference stocks, not claims about the observed local database.

District populations change when later county stocks change; that variation
is not an approximation error in the imported boundaries. Within-county shares
remain fixed as specified by the design. Matching county/district rosters does
not independently prove that the presidential precinct geometry matches every
official block, and the source redistribution review remains separate.

## Resident-price replay and remaining limits

The optional `--population-report` switches pricing to the qualified reference
resident vector. It preserves the original turnout and vote counts, pins the
population-report hash and rejects mismatched overlap rosters. Without that
option the previous turnout-proxy experiment remains reproducible.

At zero pressure, the 2027 reference quote is 0.5 PS for Alpine and 15.5 PS
for Los Angeles. A whole-county quote can exceed an NPP-only 7.5-PS state cap.
The future UI must distinguish a temporarily insufficient reserve from an
insufficient maximum cap, explain the existing active-member rule and offer
district targeting. Do not silently discount a large county or switch payers.

These steps qualify a California **reference**, not all US plans or an installed
world. National map/reference coverage, a representative 2027 budget/activity
sample, initialized county stocks, source rights, independent vote validation,
multiparty carry, atomic purchase/tally recovery and production-host performance
still need their own evidence before rollout. The design document records the
current observed report separately from these reusable instructions.
