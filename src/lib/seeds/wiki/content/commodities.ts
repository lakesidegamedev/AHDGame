export const commoditiesContent = `# Commodities

The **commodity market** tracks 27 raw materials, goods and services that flow between corporate sectors. Each commodity has a price that moves every turn with supply and demand. Those prices decide whether your corporation makes or loses money: a shortage helps whoever sells the scarce item and hurts whoever buys it. If you run a corporation, reading this market is the core skill.

## How it works

Every sector supplies and demands specific commodities, in proportion to its revenue. All the supply and demand in the world is added up, and the ratio of demand to supply (**D/S**) pushes the price: above 1 is a shortage and the price rises, below 1 is oversupply and the price falls. A state's price blends world, country and state conditions. Your margin then moves with the D/S ratio of each commodity you buy or sell, and your revenue moves with the price your output realises.

### Key numbers

| Rule | Value |
| --- | --- |
| Commodities | 27 (copper is merged into Rare Earth Minerals) |
| Price curve | price = base x (1 + 0.7 x ln(D/S)) in a shortage; base / (1 + 0.7 x ln(S/D)) in oversupply |
| Soft knee (where the curve flattens) | 3 times for most goods, 8 times for oil, coal, iron, timber, natural gas and rare earth |
| Global stabilizer | 50,000 units added to both supply and demand |
| State price blend | 50% global, 25% national, 25% state |
| Price drift toward target | 6% per turn (about 95% closed after 48 turns) |
| Margin effect per commodity | 40 x rate x ln(D/S) points, soft-capped at ±50 |
| Aggregate margin caps | Input costs at most -30 points, surplus at most +30, combined negative floored at -15 |
| Price realization factor | square root of (price / base), between 0.7 and 2.0 |
| Strategy switch | 25% of daily sector revenue, 12-turn transition at -5 margin points, 24-turn cooldown |
| Retail input penalty | Retail takes only 25% of negative input penalties |

### Worked example: a margin stack

Steel demand is twice supply (D/S 2.0) and electricity demand is 1.5 times supply. A manufacturer in its home state buys steel at a rate of 0.2 and electricity at a rate of 0.1 (illustrative rates). Its modifiers are:

- Sector type match: +5 points.
- Home state: +5 points.
- Steel input: -40 x 0.2 x ln(2) = **-5.5 points**.
- Electricity input: -40 x 0.1 x ln(1.5) = **-1.6 points**.

Net: +2.9 points against its base margin. A steel producer facing the same market gets +40 x rate x ln(2), about +27.7 points per unit of rate, so it gains from the same shortage that squeezes the manufacturer.

## The 27 commodities

| Commodity | Typical suppliers | Typical buyers |
| --- | --- | --- |
| Steel & Metals | Manufacturing, Extraction | Construction, Automobiles, Defense, Real Estate |
| Electronics & Semiconductors | Technology, Defense | Manufacturing, Healthcare, Telecommunications, Automobiles |
| Energy (Electricity) | Energy | All sectors (universal input) |
| Industrial Chemicals | Chemical Industries | Agriculture, Manufacturing, Extraction, Healthcare |
| Pharmaceuticals | Healthcare (Hospital Networks) | Healthcare, Retail |
| Fertilizers | Chemical Industries (Fertilizer Production) | Agriculture |
| Food Products | Agriculture | Logistics, Healthcare, Retail |
| Building Materials | Construction (Infrastructure co-produces), Extraction | Construction, Real Estate, Telecommunications |
| Construction Services | Construction | Real Estate, Energy, Extraction, Telecommunications |
| Healthcare Services | Healthcare | (end consumer / government demand) |
| Real Estate Services | Real Estate | Manufacturing, Technology, Financial, Healthcare, Automobiles, Logistics |
| Software & IT Services | Technology, Telecommunications | Financial, Healthcare, Media, Logistics, Defense |
| Financial Services | Financial | Real Estate, Construction |
| Advertising & Media | Media, Entertainment | Retail |
| Vehicles & Machinery | Automobiles, Defense | Energy, Agriculture, Logistics, Extraction, Construction |
| Consumer Goods | Retail | (end consumer demand) |
| Freight & Transportation | Logistics | Manufacturing, Agriculture, Chemical Industries, Extraction |
| Consulting Services | Logistics, Financial | Technology, Manufacturing |
| Iron Ore | Extraction | Manufacturing, Automobiles, Defense |
| Coal | Extraction | Energy, Manufacturing |
| Crude Oil | Extraction | Energy, Chemical Industries |
| Rare Earth Minerals | Extraction | Technology, Defense, Energy (Renewables), Automobiles (EV), Manufacturing, Construction, Telecommunications |
| Timber & Lumber | Extraction | Manufacturing, Real Estate, Agriculture, Construction, Retail |
| Natural Gas | Extraction | Energy, Manufacturing, Chemical Industries, Agriculture, Retail |
| Ordnance & Weapons Systems | Defense | Extraction focused strategies (mining explosives) |
| Plastics & Polymers | Chemical Industries (all strategies co-produce; Plastics strategy maximises output) | Manufacturing, Healthcare, Agriculture, Automobiles, Construction, Retail |
| **Network Services** | **Telecommunications (all strategies)** | (macro demand from GDP: broadband/connectivity) |

Copper is not a standalone commodity: its market was merged into Rare Earth Minerals, which now covers both and is priced as a demand-weighted blend of the two.

Entertainment Services was retired as a separate commodity. Entertainment companies still operate as media companies and still supply advertising, but there is no separate entertainment commodity to build a strategy around.

## How prices work

Commodity prices update every turn based on the global supply/demand balance. Planned economies work differently: national prices can be administered by the plan instead of tracking market S/D. See [Planned / Command Economies](/wiki/planned-economies).

### Supply and demand

Each sector type supplies and demands specific commodities at defined **rates** (fraction of daily revenue). The number of units in the market is:

\`\`\`
units = (sector daily revenue * rate) / basePrice
\`\`\`

Only **owned** sectors participate. Unowned market share does not contribute supply or demand.

**Cross-currency normalization:** Sector revenues are normalized to the anchor currency (₳) before computing commodity flows, so corporations headquartered in different countries contribute consistently to shared global supply and demand curves.

**Production policy asymmetry:** A sector's active production policy scales its commodity flows:
- **Aggressive (+25):** +15% supply output, +10% demand inputs
- **Conservative (-25):** -10% supply output, -15% demand inputs

Market price updates each turn using a **logarithmic curve** with a soft-knee (a gradual transition instead of a hard cutoff): 3× for most commodities, widened to **8×** for the six extractable resources (oil, coal, iron, timber, natural gas, and the merged rare earth/copper market), since their prices are allowed more room to run before the tail compresses.

\`\`\`
rawRatio = demand / supply
effectiveRatio = rawRatio inside the soft-knee (3x standard, 8x extractables) shortage or oversupply
above the soft-knee, log pressure keeps growing at 25% of the raw tail slope

if effectiveRatio >= 1 (shortage):   price = basePrice * (1 + 0.7 * ln(effectiveRatio))
if effectiveRatio < 1 (oversupply): price = basePrice / (1 + 0.7 * ln(1 / effectiveRatio))
\`\`\`

Raw D/S remains visible on the market screens. Prices and margins use the effective ratio, so anything beyond the soft-knee can keep worsening, but each extra unit of shortage or oversupply has steeply diminishing impact.

**Global stabilizer:** A 50,000-unit floor is added to both global supply and global demand to prevent extreme price swings when real activity is near zero (e.g. early game).

**Blended state pricing:** A state's list price for a commodity blends **50% global + 25% national + 25% regional**. The national leg is the country-aggregate S/D (with a 500-unit stabilizer); the regional leg is the state's own S/D. Prices drift toward this target each turn rather than snapping to it (drift rate 6% per turn). After ~48 turns, a price gap is 95% closed.

**National prices** are computed each turn for every country (country-aggregate S/D + a 500-unit national stabilizer) and stored alongside global and per-state prices. They feed the 25% national leg of the state-price blend and are the public price for country-level views.

**Macro-driven commodities** (financial services, healthcare services, advertising, real estate services): state-level S/D is meaningless for these markets, since activity is driven by nationwide budgets, marketing campaigns, or bond issuance. For these four, the regional leg falls through to the national price, so the effective blend becomes **50% global + 50% national**.

### Latent demand sources

Beyond sector-level supply and demand, several macroeconomic forces inject additional commodity demand each turn:

**Advertising:** Corporate marketing budgets convert to advertising commodity demand, distributed to the corporation's HQ state, but only as much as the corporation's liquid capital can actually fund for the next turn. The buyer pays only for the advertising that fills, at the clearing price, and that payment settles to the media and entertainment corporations whose offers filled it; unfilled budget stays in the buyer's treasury.

**Healthcare services:** National healthcare budgets (Medicare, NHS, etc.) convert to healthcare_services demand. **1.5%** of annual healthcare spending is spread across turns as demand.

**Financial services:** Bond-market activity drives latent financial services demand. Recent sovereign and corporate debt issuance (within the last 48 turns) is multiplied by a rate-environment factor and converted to demand. Lower central-bank prime rates boost financial activity; higher rates suppress it.

**Real estate services:** State GDP generates real estate services demand, scaled by the prime rate environment (lower rates → more demand).

**Network Services:** State GDP generates network_services demand, representing household and enterprise broadband/connectivity spending that scales with economic activity (fraction 4e-6 of GDP / base price per turn).

**Construction Services:** State GDP generates a background construction_services demand signal representing public and private infrastructure investment (fraction 5e-7 of GDP / base price per turn).

### Retail demand

Retail sectors supply **Consumer Goods**. Demand comes independently from the household consumption ledger, based on population, income, employment, consumer confidence, basket share, and bounded price elasticity. Adding Retail supply does not add Retail demand, so overbuilding lowers seller fill while a genuine shortage rewards new capacity.

## Price realization

Beyond margin modifiers, commodity prices now **scale sector revenue** directly through **price realization**:

\`\`\`
factor = clamp((price / basePrice) ^ 0.5, 0.7, 2.0)
sectorRealization = supply-rate-weighted mean of factors across outputs
realizedRevenue = baseRevenue × sectorRealization
\`\`\`

| Market condition | Realization factor |
| --- | --- |
| Balanced (price = base) | 1.0× |
| Mild shortage (2× price) | ~1.41× (the cap is 2.0×) |
| Oversupply (0.5× price) | ~0.71× (floored at 0.7×) |

Key properties:

- **Output-weighted**: sectors that sell many commodities blend realization across their supply profile.
- **Lagged prices**: realization uses prior-turn prices, breaking feedback loops that would oscillate wildly.
- **Bounded shock**: per-turn revenue moves at most -30% / +100% from realization alone.

Shortages finally reward producers with higher **top-line revenue**, not just margin percentage points, and gluts bleed revenue even when margins look tolerable. This is the main reason to chase scarce commodities under the current market system.

## Market tiers: clearing & capital

The market system has a tier ladder. Current worlds run the deepest tier, **plants**. The tier controls which extra panels appear on each sector's detail page. For a plain-language walkthrough of the whole ladder, see the [Market System guide](/wiki/market-system-guide).

### Clearing: your goods have to actually sell

Under **clearing**, revenue is no longer guaranteed: your output competes for real buyers. Each turn, demand fills the **cheapest sellers first**, so your realized revenue depends on how much of your output actually sold (your **"% sold last turn"**):

- Set an **aggressive posture** to undercut rivals and sell out ahead of them (thinner margin, fuller sales).
- Set a **premium posture** to skim for margin, accepting the risk of holding unsold output in a glut.
- In a shortage everyone sells out and premium pricing pays; in a glut, the undercutters clear and the skimmers are left with stock.

If a sector's goods don't fully sell, its revenue, and therefore its valuation and share price, reflects that. Watch the sold-fraction badge on the sector page to see why.

### Capital: capacity you own and maintain

Under **capital**, your **growth budget becomes investment**: it builds productive **capacity**, and a sector that stops investing slowly loses capacity to **depreciation**. Output is limited by the capacity your capital can support, and the sector page shows a full unit breakdown (**price − labour − inputs − capital charge**) so you can see the true economics of each unit produced.

Because capacity is a real asset, a company that reinvests its earnings into building capacity is **worth at least what that capacity is worth**, even while its current profits are temporarily lower. Its share price reflects the assets it owns, not just this turn's earnings.

### Plants: sectors are their plants

Under **plants**, the deepest tier, a sector's nameplate revenue is no longer a number in its own right: it is **derived** from the capacity you own, priced at what your output mix sells for. It therefore stops compounding on its own, and output grows only when you build more capacity.

Two knock-on effects reach the commodity market directly. Entering a new market is a **build** with a delivery delay, so new supply arrives on a lag rather than the turn it is ordered. And taking share from a rival moves **real capacity** rather than a revenue figure, with an attack destroying part of what it takes. Supply responds to shortage more slowly and more permanently than under the earlier tiers. See [Corporations](/wiki/corporations) for the build, split and attack mechanics.

### A gentle transition

When a new tier is switched on, **nothing changes on the first turn**: the new mechanics fade in gradually over time rather than snapping into place, so valuations drift rather than lurch. The intent is a smooth adjustment, not a shock: you have time to adapt your pricing and investment as the new rules take hold.

## Margin modifiers

Commodities affect corporate sector profit margins through a **logarithmic curve**:

- **Buyers (input costs):** \`modifier = -40 * rate * ln(effective D/S)\`
- **Sellers (output bonus):** \`modifier = +40 * rate * ln(effective D/S)\`

Equivalently, buyers can think of it as \`40 * rate * ln(1 / effective D/S)\`.

Reference values for a single commodity at rate 1.0:

| Raw D/S Ratio | Effective D/S | Input cost effect | Output bonus effect |
| --- | --- | --- | --- |
| 0.5x (oversupply) | 0.50x | +27.7% | -27.7% |
| 1x (balanced) | 1.00x | 0% | 0% |
| 1.5x (mild shortage) | 1.50x | -16.2% | +16.2% |
| 2x (shortage) | 2.00x | -27.7% | +27.7% |
| 3x (severe shortage) | 3.00x | -43.9% | +43.9% |
| 5x (acute shortage) | 3.41x | -49.1% | +49.1% |
| 10x (critical) | 4.05x | -50.0% (cap) | +50.0% (cap) |

Each commodity's contribution is soft-capped at **±50pp** before summing. The
input and surplus legs are capped at **−30pp** and **+30pp**, and their combined
negative channel is floored at **−15pp** by scaling both legs. These clamps always apply.

**Sign convention:**
- **Buyers** (sectors that consume a commodity): shortage *raises costs* (negative modifier), oversupply *lowers costs* (positive modifier)
- **Sellers** (sectors that produce a commodity): shortage *boosts margins* (positive), oversupply *compresses margins* (negative)

The effective curve preserves ordinary market pressure up to 3×, then sharply compresses the tail while remaining monotonic.

### Three-tier margin blend

Margin modifiers are computed independently at three scales (**global**, **national** (country-aggregate), and **local** (state)), then blended. With no tariff pressure the default weights are:

| Tier | Default weight |
| --- | --- |
| Global | 50% |
| National | 25% |
| Local (state) | 25% |

The state leg adds a stabilizer to both supply and demand to prevent extreme ratios when a state has minimal local production. State *prices* don't get this stabilizer: only the margin path does.

- **Standard commodities:** 250-unit stabilizer
- **Extractable resources** (oil, coal, iron, natural gas, timber, rare earth/copper): **2,500-unit stabilizer**: these commodities are globally traded, so a state without local deposits can realistically import them. The larger stabilizer prevents states from suffering extreme margin penalties just because they have no local oil fields or iron mines.

Tariffs shift this blend (see [Tariffs](/wiki/tariffs#commodity-blend-weight-shift)). The **local weight stays fixed at 25%**; tariff pressure moves weight from **global -> national** so corporate margins become more sensitive to country-level conditions and less to global ones. At 100% effective tariff coverage the blend becomes 25% global / 50% national / 25% local.

Retail sectors face only **25%** of negative commodity input penalties: they can better absorb supply chain disruptions than specialized industrial sectors. Positive oversupply benefits are unaffected.

### Nationalized corporations

Government-owned corporations (natcorps) contribute **100%** of their normal commodity supply and demand. State ownership does not apply a special commodity-market discount.

## Operating strategies

Each sector type has **4-8 operating strategies** that change which commodities it supplies and demands. See [Corporations](/wiki/corporations) for the full strategy list and switching mechanics.

When a sector runs a non-standard strategy, its effective supply/demand rates override the default constants for both price calculation and margin modifier computation. The strategy confirmation panel shows a before/after comparison of commodity rates and estimated margin impact based on current market conditions.

**Switching costs:**
- **Cost:** 25% of sector daily revenue
- **Transition:** 12 turns with a -5% margin penalty during the switch
- **Cooldown:** 24 turns before another strategy change

### Extraction strategies

Extraction sectors choose between a **Diversified** strategy (standard) and five **focused** strategies (there is no separate Copper Mining strategy: copper was merged into the Rare Earth Minerals commodity, and the old copper_mining strategy now maps to Rare Earth Minerals Mining):

| Strategy | Supply rate | vs Diversified | Notes |
| --- | --- | --- | --- |
| Diversified | Iron 0.25, Coal 0.22, Oil 0.14, Rare Earth 0.14, Natural Gas 0.14, Timber 0.12 | n/a | Broad coverage; no ordnance demand; strong when no single shortage dominates |
| Iron & Metals Mining | Iron **0.78** | **~3.1×** iron output | Best when iron is severely scarce (D/S above 2×) |
| Oil & Gas | Oil **0.58** + Natural Gas **0.32** | **~4.1× / ~2.3×** | Best when oil and/or natural gas are scarce |
| Coal Mining | Coal **0.72** | **~3.3×** | Best when coal is scarce |
| Timber & Forestry | Timber **0.64** | **~5.3×** | Best when timber is scarce |
| Rare Earth Minerals Mining | Rare Earth **0.72** | **~5.1×** | Covers the merged copper + rare-earth market; best when that market is scarce |

Focused strategies produce roughly **3 to 5× more** of their target commodity than the diversified strategy. If a resource is at D/S 2×+ and you have 3+ sectors, focusing beats diversifying on both supply contribution and margin. The Diversified strategy earns a broad surplus bonus across many commodities but caps quickly at the +30pp aggregate ceiling. Note: ordnance demand was removed from the Diversified strategy (blasting costs are now part of the chemicals budget rather than a weapons-system procurement).

### Extraction capacity multipliers

Extraction sectors are further modulated by state resource capacity and active
extraction contracts. A contract reserves a share of the existing state
ceiling; it does not raise that ceiling. Prospecting and corporate R&D can add
capacity. These multipliers are applied before prices and margin modifiers are
computed.

## Reading a commodity page

\`\`\`guide-screenshot
commodities-energy
\`\`\`

*The Electricity page. The header gives price, rolling one-year change, global supply, global demand, and the balance. The panels below break the balance into cleared, unmet, and surplus volume.*

Read the page from top to bottom. Do not start with the price chart.

1. **Choose the market scope.** **Global** is the world market. A country exchange shows that country's national price and its own balance. The same commodity can be short globally and long in one country.
2. **Compare price with base.** The percentage under the price is the move from the commodity's base price. A high price is only meaningful next to supply and demand.
3. **Read the balance.** Supply, demand, and the balance tell you whether the market is short or long right now. A positive balance is a surplus; a negative balance is a shortage.
4. **Read the raw D/S ratio.** This is the number the price and margin curves use. Below 1 is oversupply, above 1 is shortage.
5. **Read the pooled ledger.** Cleared, unmet, and surplus volume tell you whether the imbalance actually traded or merely sat there. Unmet demand with a high price is a real shortage. Surplus with a high price is a stale price or a storage problem.
6. **Read the price history last.** A one-turn spike is noise. A persistent trend is a build signal.

| Field | What it means | What to do with it |
| --- | --- | --- |
| Market price | Current clearing price, in the world's local currency. | Compare with base and with your input costs. |
| Rolling 1Y | Change over the last 48 turns. | Tells you whether the move is new or a trend. |
| Global supply / demand | Units offered and units wanted per day. | The balance is the first signal. |
| Balance | Surplus or shortage. | A shortage rewards sellers; a surplus rewards buyers. |
| Raw D/S | Demand divided by supply before the soft-knee. | Above 1 means shortage; below 1 means oversupply. |
| Pooled ledger | Cleared, unmet, and surplus units. | Shows whether the market actually cleared. |
| Price chart | Price, supply, and demand history. | Use it to separate a spike from a trend. |

![The Freight and Transportation commodity page showing price, supply, demand, market flows, and price history](/static/wiki/player-guides/freight-market.png)

*Freight in shortage. The price is above base, the market is undersupplied, and the flows show unmet demand. That is a build signal for logistics capacity, not for a freight buyer.*

## Storage and spoilage

Storable commodities accumulate stock when production exceeds sales and draw down when demand exceeds what producers delivered. The pooled ledger shows stock and days of cover. Non-storable goods do not store at all.

| Goods | Per-turn loss | What it means |
| --- | ---: | --- |
| Services and utilities: energy, freight, advertising, construction, healthcare, real estate, financial, consulting, network, retail | 100% | Nothing carries over. Produce what clears this turn. |
| Food | 4% | Short shelf life. Do not build for a glut. |
| Pharmaceuticals, natural gas | 1% | Small carry cost. |
| Electronics, chemicals, fertilizers | 0.5% | Obsolescence or handling loss. |
| Vehicles, timber | 0.3% | Lot depreciation and degrade. |
| Steel, building materials, ordnance, plastics | 0.2% | Cheap to hold, but not free. |
| Iron, coal, oil, rare earth | 0.1% | Cheapest to hold. |
| Software | 0% | Licences, not crates. |

The point for a player is simple: a commodity that stores well can be held through a glut; a service cannot.

## Worked example: a steel shortage

Suppose steel demand is twice supply, so the raw D/S ratio is 2.0.

- A **buyer** that consumes steel at rate 1.0 sees an input-cost modifier of roughly **-27.7 margin points**.
- A **seller** that produces steel sees an output bonus of roughly **+27.7 margin points**.
- If the seller's realized price is also above base, price realization adds revenue on top. A 2x price gives a realization factor of about **1.41x**, capped at 2.0x.

That is why vertical integration works: the same shortage that hurts a steel-consuming manufacturer helps a steel-producing extraction sector. It is also why a shortage is not automatically a build signal. If supply is already rising and the price is near the top of its run, you may be buying capacity at the peak.

## Before you build into a shortage

A shortage is a signal, not an instruction. Run these six checks before you commit capital.

1. **Is the shortage real?** Raw D/S above 1 with unmet demand in the ledger is real. A high price with a surplus in the ledger is not.
2. **Is it new?** Check the one-year chart. A spike that is already fading is a bad entry.
3. **Can you produce the right output?** The sector must have a strategy that supplies the scarce commodity at a useful rate. A diversified extraction sector produces a little of everything; a focused strategy produces three to five times more of one resource.
4. **What are your inputs?** A steel shortage may make a steel plant profitable, but it also raises input costs for anything that consumes steel. Check the margin stack, not just the output price.
5. **How long until your capacity arrives?** New plants arrive on a build delay. By the time your capacity lands, the shortage may have cleared. Short, sharp shortages reward existing capacity, not new construction.
6. **Who else is building?** If every player reads the same signal, the next wave of capacity turns the shortage into a glut. That is the commodity cycle. Enter early or stay small.

## How commodity prices affect your corporation

**Upstream shortages:** If your sector requires Steel and the global steel D/S ratio rises to 2x, your manufacturing margin takes a -27.7% hit. Competitors who are vertically integrated (owning both a manufacturing and extraction sector) partially insulate themselves.

**Downstream windfalls:** If you are a steel producer and supply tightens, your extraction sector benefits from the shortage while your competitors suffer. Timing sector entries to commodity cycles can significantly boost profits.

**Tariffs and the national tier:** Tariffs don't change *prices*, but they shift how strongly each tier matters for **margin** calculations. The local (state) leg stays at 25%; tariff pressure moves weight from the global leg to the national leg. So a country with a 50% effective tariff sees 37.5% global / 37.5% national / 25% local instead of the no-tariff 50/25/25 split. A heavy-tariff country becomes much more sensitive to its own internal supply chain. See [Tariffs](/wiki/tariffs) for the full table and the foreign/domestic margin penalties tariffs apply on top of this.

## What you can do

- **Read the page top to bottom** before building. Use the checklist above: is the shortage real, is it new, can you supply it, and who else is building?
- **Choose a strategy that supplies the scarce commodity** or avoids the expensive input (switching costs 25% of daily revenue). See [Corporations](/wiki/corporations).
- **Set your pricing posture** to undercut or skim. See [Market System: A Player's Guide](/wiki/market-system-guide).
- **Integrate vertically** to insulate yourself: own both the producer and the consumer of a commodity.
- **Lock in supply or demand** with a [Supply Agreement](/wiki/supply-agreements).
- **Hold storable goods through a glut,** but not services, which are lost every turn.

### Common questions

- **Are commodity markets country specific?** Prices blend world (50%), country (25%) and state (25%) conditions, so the same commodity can be short in one state and long in another. Tariffs shift weight from world to country.
- **Why is my profit negative in a shortage of my product?** Check the shortage is in what you *sell*. If it is in something you *buy*, it squeezes you. Also check that your goods are selling (the sold percentage) and that freight can carry them out of the state.
- **Why did my realized revenue differ from nameplate?** Price realization scales revenue by the square root of price over base, between 0.7 and 2.0.
- **What are the markets doing now?** Open any commodity page and read the price against base, the raw D/S ratio and the pooled ledger.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): every sector's supply, demand, strategy and production policy feed the totals.
- [Market System: A Player's Guide](/wiki/market-system-guide): clearing and pricing posture decide how much of supply actually sells.
- [Household Demand & Price Level](/wiki/household-economy): household demand sets consumer goods demand.
- [Supply Agreements](/wiki/supply-agreements): contracted volume leaves the open market first.
- [Brand Loyalty](/wiki/brand-loyalty): the loyal slice is reserved before cheapest-first clearing.
- [Output Quality](/wiki/output-quality): your output feeds the average quality that downstream sectors consume.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): haul becomes freight demand and sets landed prices.
- [Planned / Command Economies](/wiki/planned-economies): planned economies administer national prices.
- [Tariffs](/wiki/tariffs): tariffs shift the blend of world and country conditions.
- [National Budget](/wiki/national-budget): government spending drives healthcare and real estate demand.
- [Extraction Contracts](/wiki/extraction-contracts): Contracted extraction supplies the commodity market.
- [Resources](/wiki/resources-overview): Extraction output is the supply side of the six extractable resource prices.

**Affects**

- [Corporations](/wiki/corporations): prices and D/S ratios set your margins and realized revenue.
- [Supply Agreements](/wiki/supply-agreements): the market price sets the contract price band.
- [Brand Loyalty](/wiki/brand-loyalty): rival prices decide whether you are contested.
- [Output Quality](/wiki/output-quality): input quality is the average quality of what you consume.
- [Household Demand & Price Level](/wiki/household-economy): commodity prices feed the consumer price level.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): the Freight price sets shipping costs.
- [Market System: A Player's Guide](/wiki/market-system-guide): prices drive realization and clearing.
- [Running a Corporation under the Plants System](/wiki/plants-corp-guide): prices and the supply balance tell you whether buyers have room to build.
- [National Metrics](/wiki/national-metrics): Commodity prices push inflation up or down.

## Status

The commodity market runs in every world with private corporations. Which tier of the market system is active (clearing, capital, plants) changes the panels you see, and current worlds run the deepest tier. Planned economies administer national prices instead of tracking supply and demand. The per-commodity pages, which list suppliers and buyers, are generated from the same constants as the game.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact price rules are on the [Commodities design page](https://docs.lakesidegames.net/design/commodities.html) and the [Commodity pricing design page](https://docs.lakesidegames.net/design/commodity-pricing-v2.html).
`;
