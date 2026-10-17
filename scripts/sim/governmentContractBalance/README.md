# Extraction concession balance experiment

Tracker: [#4427](https://github.com/lakesidegamedev/AHDGame/issues/4427).

This is an offline, paired kernel-level stress experiment. It imports the actual
capacity allocator and royalty calculation but never calls a database or changes
production mechanics. The portable experimental model receives those kernels as
injected functions.

## Reproduce

From the repository root:

```powershell
npx tsx scripts/sim/governmentContractCapacityComparison.ts 'E:/Program Projects/Codex/tmp/extraction-contract-balance-sim'
npx vitest run scripts/sim/governmentContractBalance src/lib/turn/extraction/extractionCapacity.test.ts src/lib/turn/extraction/contractSettlement.test.ts --maxWorkers=1
```

Supply an output directory outside the repository. The runner writes `arms.csv`
and `summary.json` there. Reports include the source commit, dirty state, runtime
and hashes of the experiment and relevant production sources. Generated evidence
does not belong under source directories.

## Experiment

Compare total-capacity, fixed recent-output, and recent-output-with-startup-floor
quotas. Each is crossed with total-capacity-value, reserved-allocation-value and
actual-production-value royalties. The recent baseline is a mean of realized state
output before publication, frozen through the term. Strict zero output prevents
issuance; it does not prevent open-access mining. Fixed quotas are bounded by the
existing 75% physical-capacity ceiling during availability shocks.

Matched controls retain identical desired output, prices, financial resources and
cost assumptions but have no contract. The grid covers legal shares, royalty rates
and terms, multiple bidder sizes, contribution margins, cash runways and signing
fees. Paths cover light/full/congested use, idle/startup/restart, disruptions,
growth/decline, price collapse, availability shutdown and bidder expansion.

The model credits operating contribution before royalty settlement, defaults after
three unpaid royalty obligations, resets misses on payment, and returns production
to open access on the following turn. Expiry mirrors the current phase ordering:
allocation remains through the expiry production turn; settlement expires it
without a royalty charge. Follow each term with 24 post-term turns.

## Units and metrics

Resource output is a daily flow. Operating receipts per turn divide by
`TURNS_PER_DAY`. Existing royalty is rate times daily quota value each turn and
does not divide by that constant. At full utilization, 1% therefore consumes 24%
of hourly gross receipts. Candidate production-value royalty retains that time
basis, so it is not artificially discounted by a factor of 24.

The normalized grid sets total daily capacity and unit price to one; seven
seeded capacity/resource/era-price cases check scale invariance. Cash runway is
full requested-quota gross turns, and fees are requested-quota gross days.

Report forced-award defaults separately from positive incremental full-term NPV
and sustainable bids. Sustainable requires positive incremental value over open
access and no modeled royalty default. Do not let early default make a losing
full-term contract appear attractive. Government receipts from forced awards are
not forecasts of voluntary revenue. Full-term physical output metrics hold
contracts through their term so release after default cannot conceal unused quota.

The common-issuable table excludes zero-baseline cases to keep financial
comparisons matched. The complete grid separately records idle issuance gaps.

## Limitations

Uniform stress-grid frequencies are not player-population probabilities. Demand,
prices, contribution margins, fixed costs, financing and disruptions are exogenous.
Operating losses may take cash below zero; general insolvency is not modeled.
There is no endogenous market clearing, tax, borrowing, other corporate income,
investment or strategic bidding, FX volatility or insurance option value, mixed-resource
output, scarcity relief, utilization
ramp, competing auctions or full-world trajectory. Supply shutdown is an exogenous
availability shock, not a depletion simulation.

Experimental recent quotas can imply physical shares below the current API
minimum. Mixed legacy contracts, renewals and output-history storage need a
separate schema/rules design before any implementation.

This experiment can reject unit-inconsistent or fragile designs. It cannot certify
a replacement as better balanced in the full world. Any production change needs
an explicit design and further qualification. Startup-floor and averaging-window
sensitivities are experimental knobs, not recommendations to change constants.
