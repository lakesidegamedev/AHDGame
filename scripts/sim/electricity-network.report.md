# Electricity network simulation

Run `npx tsx scripts/sim/electricity-network.ts`. This uses the production clearing and production-planning functions with synthetic data, without MongoDB or player data.

## Fixture and results

Two electricity producers in the US and Japan, a Canadian buyer, 80 MWh requested per turn. A synthetic US/Canada connection permits 30 MWh dispatched per accounting turn and loses 10%. Japan has no path. Starting total cash is 1,002,000 anchor units. Producers pay existing operating costs to the buyer account; no money is minted. Every turn is computed twice from identical inputs to verify deterministic replay.

| Mode     | Turns | Dispatched MWh | Delivered MWh | Lost MWh |  Paid | Closing total cash |
| -------- | ----: | -------------: | ------------: | -------: | ----: | -----------------: |
| Off      |    48 |          3,840 |         3,840 |        0 | 3,840 |          1,002,000 |
| Shadow   |    48 |          3,840 |         3,840 |        0 | 3,840 |          1,002,000 |
| Enforced |    48 |          1,440 |         1,296 |      144 | 2,880 |          1,002,000 |

These are synthetic constraint tests, not a forecast of the live world. The script asserts cash conservation, source minus delivered equals losses, each turn's shared limit, no Japanese deliveries in Enforced, identical Off/Shadow settlement, and identical replay. A local run completed in about 72 ms; this small fixture is not a full-world CPU benchmark.

## Settlement and retry coverage

Focused tests cover disconnected domestic territories, agreements and named suppliers, internal transfers, bid limits, shared account/spend budgets, opposite directions, alternate paths with unique replay-stable trade IDs, isolated-source national-export bypasses, corrupt receipts, frozen-mode retries after interrupted writes, first funded turns and large mixed-currency balances. Comparison failures preserve the actual side and show the missing side as unavailable. Shadow never writes its counterfactual cash or inventory.

The network snapshot is in the hashed producer request. Report metadata is inserted with the immutable frozen receipt, reused on retry and shown only after settlement and turn completion in the current world. A mode change applies to the next unfrozen receipt. Reports reuse the existing producer receipt collection and its world/turn index and reset lifecycle; no new collection or GameState field is introduced. Fresh worlds deliberately start in Shadow, not Enforced.

## Performance boundaries

Funded settlement adds no Mongo command for the report: its bounded metadata travels in the existing receipt write. Aggregate sourcing adds one indexed read projected to `electricityNetwork`, independent of route or company count. Admin name lookups are batched. Shadow runs one alternate production plan with an eight-second graceful planning budget and ten-second checked execution budget; it can report unavailable without discarding actual settlement. Clock checks are cooperative, not preemptive. This is not a measured full-world before/after phase profile.

## Modeling scope

Connectivity, bidirectional shared capacity and multiplicative path losses are enforced for electricity only. Gas keeps its existing rules. Domestic regions in the same modeled national grid form an aggregate zone. Alaska, Hawaii, northern Canadian territories, Newfoundland and Northern Ireland have explicit separation. Some of those zones have named commissioned connections. Scotland and Wales retain links to the British grid when independent.

The starter catalog is deliberately approximate: aggregate transfer limits and most commissioning dates are scenario assumptions, not certified historical transfer capability. Each link carries a reference. Default losses are modeled, not measurements. Intra-zone congestion and intra-zone transmission losses are not modeled. One economic accounting turn is one twenty-fourth of a day; this is distinct from the calendar's week progression. Aggregate national export quotes conservatively use mainland state surplus; generation in other grid zones cannot bypass its named connections through that pool. Funded clearing routes named plants individually. Aggregate sourcing is a separate availability book, not a second funded shipment consuming the same actual dispatch capacity.

Reports retain existing production responses to missing inputs, including make-do premiums. They do not claim every electricity shortage causes a mandatory shutdown. Revenue and profit comparisons hold starting inputs, policies, staffing and cash fixed and can be marked provisional when a plan does not converge. Future-turn feedback is outside the single-turn comparison.

Reference anchors: [National Grid interconnectors](https://www.nationalgrid.com/national-grid-ventures/interconnectors-connecting-cleaner-future), [RTE IFA2](https://www.rte-france.com/projets/nos-projets/ifa-2-la-nouvelle-interconnexion-france-angleterre), [EirGrid interconnection](https://www.eirgrid.ie/industry/interconnection), [Canada Energy Regulator electricity](https://www.cer-rec.gc.ca/en/data-analysis/energy-commodities/electricity/). These support physical connections; modeled aggregate limits are explicit balance assumptions.
