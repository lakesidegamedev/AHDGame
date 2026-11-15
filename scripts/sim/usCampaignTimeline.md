# US local campaign timing and cost experiment

Run from the repository root, after the presidential/midterm prototype:

```powershell
npx tsx scripts/sim/usCampaignTimeline.ts --inputs "E:\Program Projects\Codex\tmp\county-political-leans-prototype" --out "E:\Program Projects\Codex\tmp\county-political-leans-prototype\campaign-timeline.json"
npx vitest run src/lib/redistricting/rules/campaignTimelinePrototype.test.ts
```

Inputs are `comparison.json` and `ca-presidential-parts.csv` from the frozen
November 10 prototype directory. The script rejects a CSV whose hash differs
from the parent report. It fixes the parent's district totals, then reconstructs
within-district county ballot weights from the presidential data. That is a
conditional modeling assumption, not a newly observed 2026 spot distribution.
All source data and generated reports stay outside the repository.

Questions: does sustained local campaigning beat a late burst without becoming
permanent support; what does it cost relative to existing PS resources; and do
county prices scale sensibly from Alpine to Los Angeles?

The 5,740-case deterministic grid uses both presidential baseline and 10%
provisional-2026 arms, 12/24/48-turn horizons, uniform/early/late turnout,
seven schedules including two/three daily actions, base prices 1/2/3/4 PS,
five absolute decay rates and two percentage rates, different starting banks,
income, opposition and party turn limits. It also compares flat, integer-unit
and fractional-unit county prices and independently rounded versus carried
fractional votes. Not every dimension is fully crossed: the script's `grid`,
`budget-opposition`, `selected`, `county-price-granularity` and
`small-county-rounding` blocks document the actual combinations.

## Economy and timing assumptions

- Current code anchors: a 24-turn House general, 2-PS Campaign Here base price,
  player-member state-party cap 30 PS, passive income 5 PS/turn, spending
  pressure +1/click and -3/turn, and maximum pressure/unit price 8.
- Opening banks and income are synthetic scenarios. Purchased PS, national
  transfers, competing political spending, alternate permission paths and
  NPP-only 7.5-PS banks are not integrated. No live budget survey is claimed.
- Each turn credits capped income, decays old effects/pressure, processes
  actions in stable receipt-ID order, then casts that turn's new ballots.
  A newly applied action receives a full first batch. Effects never modify
  earlier ballots. The future host must enforce the same cutoffs for half-turns.
- Fully capped no-ops, unaffordable actions and turn-limit rejections do not
  debit PS. Partial effects pay the full quoted cost. All paid actions share
  the party's state pressure and turn limit across actors and targets.
- Every case checks final ballot stocks and `opening + credited = spent + bank`.
  Duplicate action IDs and out-of-window actions fail validation. Rerunning
  the pure simulation is deterministic; it does not qualify database retries.

## Recommended starting rules

Use **2 state PS per district action**, the existing shared state pressure,
**25% effect loss per full turn**, and **three paid local actions per
party/state/turn**. Retain 0.4 points per action, +/-3-point spot/party cap,
and the 60% split-county magnitude. No additional campaign funds or action-pool
charge is recommended by this study.

For county pricing, set coverage units to
`max(0.25, countyCoverage / medianDistrictCoverage * effectFactor)`.
The quote is `units * min(8, 2 + pressure)`, rounded upward to half-PS steps.
Districts use one unit. The minimum initial county quote is 0.5 PS. Each paid
click still raises pressure by exactly one; coverage does not change the
shared pressure formula. The lab uses frozen turnout as a reach proxy;
production must use its qualified frozen resident snapshot.

The new quote must be explicit in the spending contract. Passing a county's
whole bill as the existing helper's `baseCost` would incorrectly clamp it to
8 PS. Preserve all legacy and other-country pricing and permissions.

Percentage decay preserves the intended county discount over the lifetime of
an action: 0.4-point and 0.24-point pulses keep a 60% ratio. Subtracting 0.1
points per turn shrinks that ratio to 42%; subtracting the old 0.5 removes both
pulses before the next turn. With 25% decay, half-life is about 2.41 turns.
Fixed-point precision and any negligible-tail pruning still need qualification.

Carry sub-vote transfer remainders by spot into later ballot batches. A daily
Alpine campaign lost all gains under independent rounding; carrying the same
fractional effects yielded ten gained votes. Earlier votes remain immutable.
This implementation carries two-party remainders only; future multiparty
counting needs a constrained vector rounding rule and its own invariants.

## Results and limits

With uniform turnout, a 30-PS opening bank, 5 PS/turn income, no opponent and
the recommended decay/limit, CA-50's original 3.63-point R margin changes by:

| District schedule                  | Paid actions | PS spent | D-minus-R margin change |
| ---------------------------------- | ------------ | -------- | ----------------------- |
| Start-turn burst of eight requests | 3            | 9        | +0.40 points            |
| Eight spread requests              | 8            | 16       | +0.91 points            |
| Last-turn burst of eight requests  | 3            | 9        | +0.10 points            |
| One daily action                   | 24           | 48       | +2.80 points            |
| Two daily actions                  | 48           | 120      | +5.41 points            |
| Three daily requests               | 52           | 136      | +5.76 points            |

Only the last two schedules flip that fixture. Two daily actions use the full
5-PS passive income through the pressure ladder. Three requests add little at
the cap and draw down reserves. Base price 1 makes the two-action schedule
cost 72 PS; prices 3/4 reject some requests. These are opportunity-cost
comparisons, not proof of one objectively optimal price. Equal daily opposition
or attacks cancel the actor's gain, with each party spending 48 PS.

Flat Los Angeles pricing yields 631 gained votes per PS versus 105 for the
district schedule. Fractional coverage pricing reduces that county case to
about 85 votes/PS. Alpine's daily schedule gains ten votes for 12 PS instead
of 48 under flat pricing. No single pricing rule establishes equal strategic
utility across all counties; the fractional quote avoids the most obvious
large-county subsidy and full-district price floor for small counties.

This is California-only party-level research. It changes no live action,
election, treasury, office or turn phase. It does not qualify the resident
crosswalk, source rights, real player budgets, nominee assignment, concurrency,
world economic feedback or production integration. Keep the full JSON report
and frozen inputs for inspection. The design document records these as
recommended defaults for further qualification, not approved live balance.
