export const resourcesOverviewContent = `# Resources

States across the game world hold deposits of natural resources that corporations can extract. Each state has a per-turn capacity for each resource, and that capacity caps how much your extraction sector can produce. It matters because capacity decides your output, the commodity supply, and what governments can contract out.

## Key numbers

| Rule | Value |
| --- | --- |
| Extractable resources | 6: oil, coal, iron, natural gas, timber, rare earth |
| Most capacity that can be reserved by contracts | 75% per state and resource |
| Prospecting survey | 6 turns base, base cost ₳500,000, up to 4x with repeat successes |
| Corporate survey success | 40% to 80% by R&D score; government flat 50% |
| Capacity gain per successful survey | Corporation 3% to 16%, government 4.5% to 12%, never above 20% |
| Active surveys at once | 6 per corporation, 6 per government |
| Deposit life in plants worlds | 1,920 turns (40 game years) at full ceiling |

## The six extractable resources

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

## The capacity system

Every state that has natural resources holds a **resource capacity document** specifying the maximum extraction output (in commodity units) it can yield per turn. These figures are benchmarked to real-world production data.

The live Resources map shows each state's capacity and is authoritative.

A reference calculation: a ₳10M/day extraction corporation running at a 20% supply rate produces roughly:
- Oil: 25,000 bbl/turn
- Coal: 13,333 tons/turn
- Natural Gas: 48,000 MMBtu/turn
- Timber: 2,000 m³/turn (at an 8% rate)

Every seeded state receives a capacity document. A state without authored
resources receives \`resources: {}\`, which means zero extraction capacity. The
runtime's uncapped fallback applies only to a truly missing document and is not
the normal state for an unlisted region.

### R&D can expand capacity

Extraction corporations with active R&D budgets can permanently increase a state's resource capacity through innovation breakthroughs. A breakthrough for an oil-and-gas corporation grows that state's oil and natural gas capacity; an iron mining breakthrough grows iron capacity only. This mechanic represents "unlocking new deposits" and means state capacities are not truly static over the game's lifetime.

### Prospecting: funding a geological survey

Prospecting is a deliberate, paid alternative to waiting on R&D breakthroughs. Any extraction corporation with a sector in a state, or that state's own government (national or state level), can commission a geological survey targeting one resource in one state. NPP miners do this too when the deposit is short and they can afford the survey.

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

Every survey is capped at adding no more than 20% of the resource's current capacity in a single roll, even at maximum R&D score. A corporation can run up to six active surveys at once; each government can also run up to six active surveys at once across the country.

A failed survey costs the money already paid and produces nothing. A successful survey immediately increases the state's capacity for that resource, available starting the next turn's commodity price calculation.

Prospecting and R&D breakthroughs stack: a corporation with a strong R&D program benefits from both a passive chance of a breakthrough each turn and much better prospecting odds when it chooses to commission a survey directly.

### Deposit depletion

In plants worlds, state deposits are finite. A resource's derived reserve is
its per-turn capacity multiplied by 1,920 turns, equal to 40 game years of
continuous extraction at the full ceiling. Only units actually extracted count
against the reserve, so a partly used field lasts longer.

The normal per-turn capacity remains unchanged until the deposit's remaining
units fall below that ceiling. Its final turns then taper rather than shutting
off all at once. Prospecting and extraction R&D raise both the flow ceiling and
the derived remaining life of the field.

## How capacity affects corporate output

Capacity caps work as a **multiplier on extraction sector output**, not a hard cutoff:

- If a sector's computed output for a resource is below the state's capacity ceiling, it operates at full output (multiplier = 1.0).
- If demand from all extraction sectors in a state exceeds available capacity, output is proportionally squeezed.
- A truly missing capacity document falls back to uncapped output for compatibility. Normally every seeded state has a document, and an empty resource map means zero capacity.

### Worked example

A state can yield 100,000 barrels of oil per turn. Corporation A holds a 40% contract, so 40,000 barrels are reserved for it and 60,000 stay open access. If the other two extraction corporations ask for 50,000 and 30,000, together 80,000 against 60,000, each is scaled to 75% and receives 37,500 and 22,500. A's output is capped at its 40,000 even if its sectors could make 55,000.

Corporation B, with an R&D score of 100, commissions a survey for the first time on this deposit: it costs ₳500,000, takes 6 turns (9 in 1953) and succeeds 60% of the time (36% in 1953). A success adds 4.5% to 12% of capacity, 4,500 to 12,000 barrels, available from the next turn's commodity price calculation. After two earlier successful surveys on this deposit, the next survey costs 2x, ₳1,000,000.

The result: resource-rich states support more extraction activity before running into diminishing returns, while resource-poor states effectively can't supply commodities they don't have in the ground.

## Contracted vs. open-access capacity

State resource capacity is divided between two pools:

**Contracted capacity** is reserved exclusively for a corporation holding an [extraction contract](/wiki/extraction-contracts). The corporation has guaranteed priority access to its contracted share of the state's ceiling.

**Open-access capacity** is the remainder: available to all extraction sectors in that state on a first-come, proportional basis. If total demand from uncontracted sectors exceeds the open pool, every uncontracted sector's output is squeezed proportionally.

Contracts cannot take the total offered and active share above **75%**, so at least one quarter remains open access.

## Which states have which resources

Major resource concentrations vary with the countries and start date of the world. The live Resources map is the authoritative view for every state. Some representative concentrations are:

**United States**: Texas leads in oil and natural gas. Pennsylvania and West Virginia are major gas and coal producers. Minnesota holds the largest iron deposits. Wyoming and Alaska are uniquely diverse, holding several resource types each.

**United Kingdom**: Scotland holds the country's largest oil and gas deposits (North Sea). Wales, Yorkshire, and the East and West Midlands hold most of the UK's remaining coal and iron.

**Germany**: North Rhine-Westphalia dominates coal and iron production. Lower Saxony holds oil and natural gas. Bavaria and Rhineland-Palatinate hold rare earth deposits.

**Japan**: Hokkaido and Kyushu hold coal and timber. Chugoku and Tohoku hold rare earth and natural gas. Japan's overall resource base is modest compared to North American counterparts.

Other enabled country maps, including Ireland, Brazil, Nigeria, China, Russia, and East Germany where present for the selected era, carry their own authored deposits. Use each country's Resources map instead of assuming the examples above are exhaustive.

## What you can do

- **Check capacity** on a region's **Resources** tab before you build an extraction sector: it shows daily capacity, output, contracted shares and open headroom.
- **Bid for a contract** when open access is crowded. See [Extraction Contracts](/wiki/extraction-contracts).
- **Commission a survey** (extraction corporations with a sector in the state, or that state's or country's government) to grow capacity. Tip: surveys get more expensive each time one succeeds on the same deposit, so spread them out.
- **Invest in R&D** for permanent capacity breakthroughs and better survey odds.

## Common questions

- **Why is my output lower than my sector size implies?** Capacity is shared. If total demand in the state exceeds the open pool, every uncontracted sector is squeezed proportionally.
- **Can only extraction companies hold contracts?** Yes.
- **Who awards contracts?** The government level set by the country's Resource Extraction Authority Act. See [Extraction Contracts](/wiki/extraction-contracts).
- **R&D or prospecting for more capacity?** R&D gives a passive chance of a breakthrough each turn. Prospecting is a paid, deliberate roll with better odds as your R&D score rises. They stack.
- **How long do deposits last?** In plants worlds, 40 game years at the full ceiling, then they taper off. In other worlds capacity does not run out on its own.

## Why resources matter

Resources flow directly into the [commodity pricing engine](/wiki/commodities). When extraction output is high, commodity supply is abundant and prices fall, benefiting industrial sectors that use those commodities as inputs. When output is constrained (whether by capacity ceilings, lack of contracts, or over-allocation), supply tightens and commodity prices rise, squeezing margins for downstream sectors.

Legislators and corporations can influence resource flows through three tools:
- **[Extraction contracts](/wiki/extraction-contracts)**, granting exclusive capacity shares to specific corporations
- **Prospecting**, paying for a geological survey to grow a state's capacity for a resource
- **[Subsidies](/wiki/subsidies)**, providing margin bonuses that make extraction sectors more profitable regardless of commodity prices

For the corporate side of this system, see [Corporations](/wiki/corporations).

## Connections

**Driven by**

- [Extraction Contracts](/wiki/extraction-contracts): contracts reserve part of a state's capacity for one corporation.
- [Subsidies](/wiki/subsidies): margin bonuses make extraction sectors more profitable to run.
- [Corporations](/wiki/corporations): R&D breakthroughs and surveys raise capacity.

**Affects**

- [Commodities](/wiki/commodities): extraction output is the supply side of oil, coal, iron, natural gas, timber and rare earth prices.
- [Corporations](/wiki/corporations): capacity squeezes set what extraction sectors can earn.

## Status

Resource capacity applies wherever corporations extract resources. Deposits are finite and taper off only in worlds that use the plants system. Prospecting results are scaled by era: surveys in 1953 take 1.5 times as long, succeed 0.6 times as often and pay 1.6 times as much as in the present day.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules and source constants are on the [resources design page](https://docs.lakesidegames.net/design/resources.html).
`;
