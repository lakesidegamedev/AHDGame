# Westminster approval and separation desire

## Method

Run `npx tsx scripts/sim/westminsterApprovalComparison.ts output.json`.
The deterministic harness compares the previous stance-dependent Westminster
approval contribution with the new stance-independent contribution. Both arms
use the shared production rules for all other drivers.

243 paired scenarios cover SCO, WAL and NIR, all nine combinations of regional
and Westminster stances, and Westminster approvals of 0, 25, 29.2, 49.9, 50,
50.1, 70, 75 and 100 percent. Each runs for 480 turns (ten game years), with a
48-turn checkpoint. Starting desires are synthetic controls: SCO 60, WAL 36.13,
NIR 45. Regional approval stays at 33.9 percent and inflation at 6 percent.
These fixed-input sensitivities are not a live-world forecast; events, elections,
changing economic conditions and later stance choices are excluded.

## Results

All 243 scenarios retain desire within 0 to 100. Neutral Westminster approval
(50 percent) and all anti-devolution Westminster control trajectories are
identical before and after. The national approval driver is independent of
both governments' stances, positive below 50, negative above 50, and capped
at 0.025 in either direction. Regional approval and direct stance effects retain
their existing rules.

For the rounded dashboard illustration (WAL starts at 36.13; both governments
pro-independence; regional approval 33.9; Westminster approval 29.2; inflation 6):

| Result                                     | Previous rule | New rule |
| ------------------------------------------ | ------------: | -------: |
| Westminster approval contribution per turn |       -0.0208 |  +0.0208 |
| Net movement on the first turn             |       +0.0390 |  +0.0806 |
| Desire after 48 turns                      |       38.0020 |  39.9988 |
| Desire after 480 turns                     |       54.8500 |  74.8180 |

The shared dashboard forecast also projects +3.8688 points over 48 turns and
297 turns to 60 for this illustration. It remains conditional on fixed inputs;
referendum eligibility and consent requirements are unchanged.
