# US geographic election prototype

Offline experiment only. Nothing imports these rules into the turn processor,
API, seed plan or production resolver. No database or live player data is used.

Run from the repository root:

```powershell
npx tsx scripts/sim/usGeographicPrototype.ts --inputs "E:\Program Projects\Codex\tmp\county-political-leans-prototype" --out "E:\Program Projects\Codex\tmp\county-political-leans-prototype\comparison.json"
npx vitest run src/lib/redistricting/rules/usGeographicPrototype.test.ts
```

The input directory contains these public-source snapshots. Download the exact
URLs in `SOURCES` in the harness, retaining filenames; use a new directory for
each acquisition. Reports hash every source so later downloads are visibly
different inputs. Do not commit external datasets without qualifying their
redistribution terms.

- `presidential-totals.csv`: The Downballot's national 2024 presidential totals
  on its published 2026 district map, totals worksheet (gid 1491069057).
- `ca-presidential-parts.csv`: its California county/partial-county calculations,
  default worksheet, spreadsheet `1HFC7LLKVhDKwPPQFjMCyRlt9ZAaii7xrQ-Bn4Hl6cZw`.
- `C26GG.txt`, `V26GG.txt`, `S26GG.txt`: California Secretary of State candidate,
  results and county-code files for the November 2026 general election.

This is California vote geography, not a qualified national population map.
The 144 spots use observed/source-calculated 2024 two-party ballot totals as
fixed turnout weights in both arms. Residents and third-party votes are not
modeled. The source plan still needs official boundary verification. The harness
checks overlap sums against district presidential totals (reports differences
of at most one vote per party, rejects larger differences) and requires official
2026 county totals to reconcile exactly to the comparable district totals.

## Experimental rules

The baseline is one presidential election, not the existing two-election Cook
PVI dataset. A spot's signed lean is its Republican two-party share minus 50.
Weights use `exp(direction * strength * centeredLogOdds / 2)`, with share bounds
of `1e-9` for finite log odds. At strength 1 and two parties positioned at -1/+1,
feeding original statewide counts reconstructs the source support. A continuous
direction clamps position to [-1, 1]; the comparison pool adapter uses the
existing thresholds -1/+1 with zero direction between them. This mapping is a
provisional modeling choice, not a measured map of player party identities.

Iterative proportional fitting preserves turnout rows and party columns.
A residual bipartite flow rounds to integers while preserving both margins.
Nonconvergence or incompatible totals raises an error. Stable identity order
makes shuffled inputs reproducible. Exactly tied and zero-vote districts remain
unresolved. Candidate nominee assignment is outside this party-level experiment.

The 2026 arm excludes contests other than exactly one Democrat against one
Republican, missing observations and overlaps below 500 two-party ballots.
It subtracts the covered statewide swing, clips each remaining local residual
to ten share points, then blends weights 0, 0.10, 0.25 and 0.50. Unsupported spots
keep their baseline values with a reason. Final statewide calibration holds the
synthetic game party totals fixed, so changes concern geography, not a national
wave. This is sensitivity analysis using the fitting data, not held-out accuracy.

Campaign effects are simultaneous transfers inside one future ballot batch.
They conserve votes, permit eligible zero-support parties to gain support, and
bound actual per-party changes to the cap plus at most one rounding vote.
County and district actions share a signed spot/party ledger; opposite actions
cancel, and a split-county action has a provisional 0.6 factor. Actions cannot
attack the actor's own party. The actor/target eligibility list belongs to a
future shell, not this experiment. Test parameters are 0.4 points/action and
a 3-point cap. Costs, duration, decay, receipt persistence and concurrent API
updates are not qualified here.

Sweep fields include 40/30/30 parties, positions inside the grey band, and vote
fields transcribed from the existing #926 regressions. Those historic vote
fields are applied to California as synthetic sensitivity cases; they are not
replays of the original Texas/California production worlds. There are no
proportional quotas or maximum-seat-share overrides.

## Interpretation and recommendations

The initial snapshot (November 10, 2026) covers 120/144 spots with comparable
2026 returns, representing 80.77% of baseline two-party ballots. At synthetic
50/50 statewide support, baseline and 10%/25% evidence arms yield 21 D / 31 R
districts; 50% evidence yields 23 D / 29 R. These are game scenarios, not claims
about either real election's seat totals. The mean absolute margin changes are
0.58, 1.44 and 2.89 points respectively; maximum changes are 1.81, 4.54 and 9.16.

- Prefer the continuous adapter for further experiments. The grey-band field
  sweeps all 52 seats with the pool adapter at strength 1; continuous positions
  reduce that to 50. This removes the threshold discontinuity, not all sweep
  risk. Do not choose strength just to force a proportional-looking outcome.
- Start the next experiment at strength 1 because it has an interpretable
  two-party reconstruction property. Qualify actual player positions and
  other states before adopting it.
- Retain the presidential baseline as the release default. Test 10% provisional
  evidence as a separate experimental arm; certification, source rights and
  held-out comparisons must precede any production evidence weight. The 25%
  and 50% arms have materially larger local effects.
- Retain 0.4 points, 3-point cap and 0.6 split-county factor as provisional
  guardrails. With the closest baseline district, CA-50, a full-batch 3-point
  push flips a 3.63-point margin; affecting only the last half of ballots does
  not. One 0.4-point action does not flip it. Test a multi-turn action schedule
  before recommending decay or costs; this harness supplies no economic data.
- Keep ties unresolved and expose the reason. Scheduling a vacancy election
  still needs the existing lifecycle integration and acceptance tests.

Country-isolation tests exercise the prototype boundary with actual legacy
seat allocators, ranked Irish counting and Japanese mixed district/list rules.
Non-US cases never invoke the prototype callback, even when a US-looking plan
is present. Invalid cross-country bindings fail rather than changing methods.
This does not qualify production dispatch, office writes, rollback, transaction
recovery, or turn performance: none of those hosts has been changed.

The JSON report retains complete district results, exclusions, source hashes,
source header, implementation hashes and runtime. Generated reports and public
input snapshots belong under `E:\Program Projects\Codex\tmp\<task-name>`.
