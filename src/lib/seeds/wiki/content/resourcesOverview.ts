export const resourcesOverviewContent = `# Resources

Before you build an oil rig or a coal mine, check the ground. Every state holds a capacity for each natural resource, an output ceiling on the same daily basis as sector revenue, and that capacity caps how much your extraction sector can produce. It decides your output, the commodity supply, and what governments can contract out.

| Rule | Value |
| --- | --- |
| Extractable resources | 6: oil, coal, iron, natural gas, timber, rare earth |
| Most capacity that can be reserved by contracts | 75% per state and resource |
| Prospecting survey | 6 turns base, base cost ₳500,000, up to 4x with repeat successes |
| Corporate survey success | 40% to 80% by R&D score; government flat 50% |
| Capacity gain per successful survey | Corporation 3% to 16%, government 4.5% to 12%, never above 20% (times the era payout multiplier) |
| Active surveys at once | 6 per corporation, 6 for a national government, 6 per state for a state government |
| Deposit life in plants worlds | 1,920 turns (40 game years) at full ceiling |

## What the ground holds

Six resources can be extracted from state deposits. Each is measured in its own unit:

| Resource | Unit | Primary economic role |
| --- | --- | --- |
| Oil | barrels (bbl) | Energy sector input; chemical industries |
| Coal | tons | Energy and industrial input |
| Iron | tons | Industrial and construction input |
| Natural Gas | MMBtu | Energy sector input |
| Timber | cubic metres (m³) | Construction and paper input |
| Rare Earth | tons | Technology sector strategic input |

Copper is folded into Rare Earth rather than tracked as its own commodity. These six are a subset of the broader set of commodities tracked in the commodity pricing engine. Standard manufactured commodities (steel, electronics, consumer goods) have no extraction model: they come from corporate sectors processing other inputs, not from the ground.

Every state that has natural resources holds a **resource capacity document** specifying the maximum extraction output (in commodity units) it can yield, on the daily basis the Resources tab shows. These figures are benchmarked to real-world production data. The live Resources map shows each state's capacity and is authoritative. Check a region's **Resources** tab before you build an extraction sector: it shows daily capacity, output, contracted shares and open headroom.

A sector's raw output is its daily revenue times its strategy's supply rate for the resource, divided by the base price. A reference calculation for a ₳10M/day extraction corporation, before any output scaling the world applies:
- Oil: 25,000 bbl/day (at a 20% rate, ₳80 a barrel)
- Coal: 13,333 tons/day (at a 20% rate, ₳150 a ton)
- Natural Gas: 48,000 MMBtu/day (at a 12% rate, ₳25 per MMBtu)
- Timber: 2,000 m³/day (at an 8% rate, ₳400 per m³)

Every seeded state receives a capacity document. A state without authored
resources receives \`resources: {}\`, which means zero extraction capacity. The
runtime's uncapped fallback applies only to a truly missing document and is not
the normal state for an unlisted region.

### Where the deposits are

Major resource concentrations vary with the countries and start date of the world. Some representative concentrations are:

**United States**: Texas leads in oil and natural gas. Wyoming holds the most coal, and Pennsylvania and West Virginia are major gas and coal producers. Minnesota holds the largest iron deposits. Wyoming and Alaska are unusually diverse, holding several resource types each.

**United Kingdom**: Scotland holds the country's largest oil and gas deposits (North Sea), absent in 1953 worlds because North Sea production began later. North East England, Yorkshire, Wales and the East and West Midlands hold most of the UK's coal and iron.

**Germany**: North Rhine-Westphalia dominates coal and iron production. Lower Saxony holds most of the oil and natural gas. Saxony holds the largest rare earth deposit, with smaller ones in Lower Saxony, Bavaria, Thuringia and Rhineland-Palatinate.

**Japan**: Chubu holds Japan's largest coal, iron, oil, natural gas and rare earth deposits, with Kansai and Kinki South next. Hokkaido has the most timber, and Hokkaido and Kyushu hold smaller coal fields. Japan's overall resource base is modest compared to North American counterparts.

Other enabled country maps, including Ireland, Brazil, Nigeria, China, Russia, and East Germany where present for the selected era, carry their own authored deposits. Use each country's Resources map instead of assuming the examples above are exhaustive.

## Sharing a crowded state

State capacity is divided between two pools:

**Contracted capacity** is reserved exclusively for a corporation holding an [extraction contract](/wiki/extraction-contracts). The corporation has guaranteed priority access to its contracted share of the state's ceiling.

**Open-access capacity** is the remainder: shared by all extraction sectors in that state in proportion to demand. A contract holder's demand beyond its own share also competes here. If total demand on the open pool exceeds it, every claim on the pool is squeezed proportionally. A contracted share stays reserved even when its holder digs less than it.

Contracts cannot take the total offered and active share above **75%**, so at least one quarter remains open access. Bid for a contract when open access is crowded; see [Extraction Contracts](/wiki/extraction-contracts).

![State capacity splits into a contracted pool and an open-access pool, which set sector output, commodity supply, price and margins, while prospecting and R&D expand capacity.](/wiki-images/diagrams/resources-overview-capacity-pools.svg)

Capacity caps work as a **multiplier on extraction sector output**, not a hard cutoff:

- If a sector's computed output for a resource is below the state's capacity ceiling, it operates at full output (multiplier = 1.0).
- If demand from all extraction sectors in a state exceeds available capacity, output is proportionally squeezed.
- A truly missing capacity document falls back to uncapped output for compatibility. Normally every seeded state has a document, and an empty resource map means zero capacity.

A state can yield 100,000 barrels of oil a day. Corporation A holds a 40% contract, so 40,000 barrels are reserved for it and 60,000 stay open access. If A wants 40,000 and the other two extraction corporations ask for 50,000 and 30,000, together 80,000 against 60,000, each is scaled to 75% and receives 37,500 and 22,500. If A's sectors want 55,000 instead, its extra 15,000 joins the open pool: 95,000 against 60,000 scales every pool claim to about 63%, so A gets 40,000 plus 9,474 and the others 31,579 and 18,947.

The result: resource-rich states support more extraction activity before running into diminishing returns, while resource-poor states effectively can't supply commodities they don't have in the ground.

So if your output is lower than your sector size implies, capacity is shared: when demand on the open pool exceeds it, every claim on the pool is squeezed proportionally. Only extraction companies can hold contracts, and the government level that awards them is set by the country's Resource Extraction Authority Act.

## Growing capacity

There are two ways to push a state's ceiling up, and they stack: a corporation with a strong R&D program benefits from both a passive chance of a breakthrough every 6 turns and much better prospecting odds when it chooses to commission a survey directly.

### R&D breakthroughs

Extraction corporations with active R&D budgets can permanently increase a state's resource capacity through innovation breakthroughs. Every 6 turns a corporation has a chance of rdScore / 200 of a breakthrough in one of its sectors, which raises that state's capacity by 1% to 15% for each resource the sector's strategy produces. An Oil & Gas breakthrough grows that state's oil and natural gas capacity; an Iron & Metals Mining breakthrough grows iron capacity only. This mechanic represents "unlocking new deposits" and means state capacities are not truly static over the game's lifetime.

### Prospecting: funding a geological survey

Prospecting is a deliberate, paid alternative to waiting on R&D breakthroughs. Any extraction corporation with a sector in a state, or that state's own government (national or state level), can commission a geological survey targeting one resource in one state. NPP miners do this too when the deposit is short and they can afford the survey.

\`\`\`wiki-chart
prospecting-success-and-gain
\`\`\`

Finder's rights: when a corporation's survey succeeds, it also receives a royalty-free extraction contract for 96 turns covering what it found, within the contract headroom.

A survey has a 6-turn base duration multiplied by the era duration scale. In
the 1953 preset that is 9 turns. Earlier eras also scale success chance and yield: in 1953 success odds are multiplied by 0.6 and the payout by 1.6 (\`src/lib/constants/prospecting.ts\`). The corporation launching a survey pays a
starting cost of ₳500,000, which climbs the more that state and resource have
already been successfully surveyed (up to 4x the base cost). Government-funded
surveys draw from the national treasury or the state budget instead of a
corporation's cash.

Success odds and payout differ by who is funding the survey:

| Initiator | Success chance | Capacity gain on success |
| --- | --- | --- |
| Corporation | 40% to 80%, scaling with the corporation's R&D score | 3% to 16% of current capacity, scaling with R&D score |
| Government (national or state) | Flat 50% | 4.5% to 12% of current capacity |

Every survey is capped at adding no more than 20% of the resource's current capacity in a single roll, even at maximum R&D score. The cap scales with the era payout, so in 1953 it is 32%. A corporation can run up to six active surveys at once. A national government can run six across the country, and each state government six in its own state. A national survey is commissioned by the head of government or finance minister, a state survey by the governor for one gubernatorial action point.

A failed survey costs the money already paid and produces nothing. A successful survey immediately increases the state's capacity for that resource, in time for the same turn's commodity price calculation. Surveys get more expensive each time one succeeds on the same deposit, so spread them out.

Corporation B, with an R&D score of 100, commissions a survey for the first time on the oil deposit above: it costs ₳500,000, takes 6 turns (9 in 1953) and succeeds 60% of the time (36% in 1953). A success adds 4.5% to 12% of capacity, 4,500 to 12,000 barrels, available to that turn's commodity price calculation. After two earlier successful surveys on this deposit, the next survey costs 2x, ₳1,000,000.

### When deposits run out

In plants worlds, state deposits are finite. A resource's derived reserve is
its capacity multiplied by 1,920 turns, equal to 40 game years of
continuous extraction at the full ceiling. Only units actually extracted count
against the reserve, so a partly used field lasts longer.

\`\`\`wiki-chart
deposit-depletion-ceiling
\`\`\`

The normal capacity remains unchanged until the deposit's remaining
units fall below that ceiling. Its final turns then taper rather than shutting
off all at once. Prospecting and extraction R&D raise both the flow ceiling and
the derived remaining life of the field. In other worlds capacity does not run out on its own.

## How resources reach prices and policy

Resources flow directly into the [commodity pricing engine](/wiki/commodities). When extraction output is high, commodity supply is abundant and prices fall, benefiting industrial sectors that use those commodities as inputs. When output is constrained (whether by capacity ceilings, lack of contracts, or over-allocation), supply tightens and commodity prices rise, squeezing margins for downstream sectors. Extraction output is the supply side of oil, coal, iron, natural gas, timber and rare earth prices.

Legislators and corporations can influence resource flows through three tools:
- **[Extraction contracts](/wiki/extraction-contracts)**, granting exclusive capacity shares to specific corporations
- **Prospecting**, paying for a geological survey to grow a state's capacity for a resource
- **[Subsidies](/wiki/subsidies)**, providing margin bonuses that make extraction sectors more profitable regardless of commodity prices, and so make resource-rich states more productive

[Corporations](/wiki/corporations) drive the R&D breakthroughs and surveys that raise capacity, and capacity squeezes in turn set what extraction sectors can earn.

Resource capacity applies wherever corporations extract resources. Deposits are finite and taper off only in worlds that use the plants system. Prospecting results are scaled by era: surveys in 1953 take 1.5 times as long, succeed 0.6 times as often and pay 1.6 times as much as in the present day. Last checked 2026-10-30, version 1.18.0. Exact rules: [Resources (design)](https://docs.lakesidegames.net/design/resources.html)
`;
