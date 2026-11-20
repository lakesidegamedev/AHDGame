import {
  BUYER_TOLERANCE_SLACK,
  FREIGHT_SHIPPING_MAX_ASK_SHARE,
  FREIGHT_PRICE_TEU_PER_UNIT_HOP,
  FREIGHT_CONGESTION_OVERFLOW,
  FREIGHT_CONGESTION_SURCHARGE,
  FREIGHT_TEU_PER_UNIT_HOP,
  GRID_LOSS_PER_HOP,
  GRID_WHEELING_PER_HOP_FRACTION,
  SEA_FREIGHT_HOP_EQUIV,
} from "@/lib/logistics/sourcing";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const overflowMultiple = (1 + FREIGHT_CONGESTION_OVERFLOW).toFixed(1);
const gridSurvivalOverSeaHops = Math.pow(1 - GRID_LOSS_PER_HOP, SEA_FREIGHT_HOP_EQUIV);

export const logisticsGuideContent = `# Logistics: Freight, Sourcing, and Supply Chains

If your sector shows a low selling %, check demand, pricing, and delivery. The Logistics map and the sector's Freight tag help you spot delivery constraints. It connects the commodity market to the map: the game projects how a state with unmet input demand would source locally, across state lines, or from abroad after shipping and tariffs. Logistics sectors provide the freight capacity measured by that projection. Heavy haul becomes real Freight commodity demand, so tight capacity raises freight sold volume and price. Electricity and natural gas are the exception: they travel by wire and pipe, spend no freight capacity, and pay distance in transmission loss instead.

Freight settlement applies measured delivery limits to legacy clearing offers. The Freight market records demand in TEU from the sourcing calculation. Where **freight billing** is enabled, the commodity turn saves separate haul records for billing. The corporation turn uses those records on the next turn to charge buyer sectors in proportion to the inbound inputs they consume and credit freight suppliers in the origin state. Corporate logistics strength can lower an eligible buyer's charge without reducing supplier credit. In a world that is still phasing this in, the measured delivery limit and the shipping bill scale up together, and the phase-in fraction is shown on the markets view and the sector Freight tag.

For a corporation, logistics answers three questions:

1. **Can the market supply the input locally?** Projected local supply fills first and uses no freight capacity.
2. **If not, where is the cheapest reachable seller?** The sourcing projection compares the seller's ask, shipping cost, and tariff.
3. **What does the route cost?** Projected interstate haul consumes freight capacity in the seller's state, and haul past that state's nominal capacity pays a congestion surcharge on top. Capacity is mostly a price rather than a ceiling: haul can run to ${overflowMultiple}x nominal capacity at a surcharge, and the buyer's price tolerance usually stops a route before that. Grid goods skip the haulage fleet entirely.

## Start with the Freight page

The Freight & Transportation page shows the global or exchange-level price, supply, demand, cleared volume, unmet demand, and unsold capacity. The unit is **TEU**, a container-equivalent measure of transport capacity.

![The Freight and Transportation commodity page showing price, supply, demand, market flows, and price history](/static/wiki/player-guides/freight-market.png)

Use the page like this:

- **Demand above supply:** freight is scarce. Logistics sectors have room to sell more capacity, and shipping becomes more expensive for commodity buyers.
- **Supply above demand:** some freight capacity is going unsold. Expanding now risks low fill and weak margins.
- **Price above base:** the shortage has persisted long enough to lift the market price.
- **Cleared volume:** the amount of freight capacity the market actually used this turn.

Freight is itself a [commodity](/wiki/commodities): unmet input demand creates haul, and the Freight price sets shipping cost. A logistics sector earns through the freight market just as an energy sector earns through electricity. Interstate haul is booked as demand for that commodity every market turn.

## Then the Logistics map

Open a country's map and select **Logistics**. Green intensity follows the freight capacity available in each state. Hover a state to see:

- freight capacity in TEU;
- interstate haul per turn;
- utilization;
- the split between bulk and special freight.

![The United States map in Logistics mode, with freight capacity highlighted by state](/static/wiki/player-guides/logistics-map.png)

The map and commodity page answer different questions. The commodity page tells you whether freight is scarce overall. The map tells you where the network exists and where domestic haul is loading it.

## How a route is chosen

For each haul, each state with unmet demand ranks eligible sellers by **landed price**:

\`landed price = seller ask + shipping + tariff\`

The cheapest eligible source fills first, up to three limits:

1. the buyer's remaining demand;
2. the seller's spare supply;
3. the buyer's price tolerance.

![Local, cross-state and import sources are ranked by landed price, and the cheapest one inside the tolerance ceiling fills first.](/wiki-images/diagrams/logistics-guide-landed-price.svg)

Freight capacity is the fourth influence, and it acts mostly through price. Bulk and special cargo draw from the same state freight fleet. Haul above that fleet's nominal capacity keeps running at a surcharge, up to ${overflowMultiple}x nominal, which pushes the landed price toward the tolerance ceiling. A state with no freight supply at all still hauls nothing. However tight freight gets, the shipping charge on a haul never exceeds ${pct(FREIGHT_SHIPPING_MAX_ASK_SHARE)} of the seller's ask.

The tolerance ceiling is the local price plus ${pct(BUYER_TOLERANCE_SLACK)}. A technically reachable projected shipment can still be rejected when freight and tariffs make it too expensive. The sourcing report records that amount as unmet, while aggregate commodity clearing remains the source of truth for the commodity market itself. Route calculation measures haul and creates Freight demand; it is not a settled commodity transfer.

Imports use a flat ${SEA_FREIGHT_HOP_EQUIV}-hop sea equivalent for landed-price comparison. Domestic states with no modeled route use the same fallback. Embargoes remove a route entirely; [tariffs](/wiki/tariffs) leave it open but make it more expensive (see also [International Trade](/wiki/trade-system) for cross-border clearing, embargoes and trade balances). Overseas supply affects landed price through the sea-hop cost and tariffs, but it does not consume an origin state's domestic freight pool.

### Three freight classes

Every shipped commodity belongs to one of three classes. Two of them ride the same haulage fleet and spend a state's freight capacity. The third does not.

| Class | Capacity TEU per unit-hop | Shipping-price weight per unit-hop | Typical cargo |
| --- | ---: | ---: | --- |
| Bulk | ${FREIGHT_TEU_PER_UNIT_HOP.bulk} | ${FREIGHT_PRICE_TEU_PER_UNIT_HOP.bulk} | Heavy raw materials and ordinary physical goods |
| Special | ${FREIGHT_TEU_PER_UNIT_HOP.special} | ${FREIGHT_PRICE_TEU_PER_UNIT_HOP.special} | Higher-care or specialized cargo |
| Grid | ${FREIGHT_TEU_PER_UNIT_HOP.grid} | ${FREIGHT_PRICE_TEU_PER_UNIT_HOP.grid} | Electricity and natural gas |

Special cargo consumes more TEU per unit per hop, but it does not have a separate reserved pool. Bulk and special loads share every available TEU in the state. The map tooltip separates the two loads so you can see what is using the fleet, not because one class is forbidden from using capacity left idle by the other.

Capacity load and shipping price use separate weights. The capacity weight keeps real haul visible on the Logistics map; the smaller shipping-price weight converts the freight-market price into the charge buyers compare with the cargo price. Raising network load therefore does not automatically multiply every shipping bill by the same amount.

### Grid: wire and pipe

Electricity and natural gas are delivered by wire and pipe. They cross state lines like anything else, but they never draw on the haulage fleet and never create Freight demand. So a power sector in a state with a thin freight network can still sell outside it. Distance still costs, in two ways:

- **Transmission loss.** Every state line crossed loses ${pct(GRID_LOSS_PER_HOP)} of the units dispatched. A ${SEA_FREIGHT_HOP_EQUIV}-hop haul delivers about ${pct(gridSurvivalOverSeaHops)} of what was sent, so the seller draws down more than the buyer receives.
- **A wheeling charge.** Every crossing adds ${pct(GRID_WHEELING_PER_HOP_FRACTION)} of the seller's ask to the landed price. The charge is priced off the seller, not off the freight market, so a freight shortage does not raise the cost of power.

There is no capacity ceiling on a grid route, so a state short of power can always import it at a price. Loss and wheeling are what keep distant generation behind local generation in the landed-price sort. Generation sited far from load still sells; it sells at a discount for the distance.

## When the network is congested

Freight capacity mostly sets a price rather than a ceiling. Once combined bulk and special haul in a state passes the fleet's nominal capacity:

- the network keeps moving goods up to ${overflowMultiple}x that nominal capacity;
- every unit above nominal pays a ${pct(FREIGHT_CONGESTION_SURCHARGE)} surcharge on the shipping leg of its landed price;
- the buyer's tolerance ceiling ends the flow. If the surcharged landed price breaks the ceiling, the overflow does not move and the demand is recorded as unmet on price rather than on capacity.

A short haul into a congested state usually still clears, because the surcharge falls on a small shipping leg. A long haul into the same state prices itself out. A state with no freight supply of its own hauls nothing at any price.

Because haul can now run past nominal capacity, a state's load can exceed its capacity. That is congestion, and the units above capacity are the ones paying the surcharge. Sustained congestion in a state is a standing signal for a logistics CEO: the haul is real Freight demand, and the last units of it are moving at a premium.

## When freight limits delivery

A **Freight** tag signals a delivery constraint on the sector's output. Check the sector's recorded sales, revenue, and margin for the financial results. Selling % alone leaves the reason for a revenue change unclear.

Under legacy clearing, measured delivery limits cap the physical offer for each commodity. The legacy revenue calculation adds back the measured freight-limited share, up to 100% of output. A shortage of buyers can still reduce revenue.

On turns using the funded producer market, the sector's sales and revenue come from settlement. Sellers are credited for filled, paid orders.

If the **Freight** tag appears, check the Logistics map for the origin state and the commodity balance on your exchange. If the route is consistently constrained, consider adding freight capacity in that state by opening or buying into a logistics sector, or site new production closer to demand. If selling % is low, also check demand and pricing before cutting output. A dark state on the map can reflect little industry and haul, so check local demand and the exchange before building.

Sector accounts report freight charges and credits as per-turn billing lines. Freight contracts that reserve haulage in one state come from [Supply Agreements](/wiki/supply-agreements).

## If you run a logistics corporation

Before opening a sector:

1. Open the Freight commodity page and check the exchange where you plan to operate.
2. Open the country map in Logistics mode.
3. Look for a state with low capacity, meaningful haul, and an undersupplied freight market.
4. Check the target state's local business conditions and your corporation's type match.
5. Build only enough capacity to fit visible demand. Capacity arrives gradually and idle plants still cost money; see [Running a Corporation under the Plants System](/wiki/plants-corp-guide) for capacity, fill, build queues, and break-even.

After opening it:

- Watch **selling %** and the **Freight** tag on the sector page, and check recorded sales and revenue for the turn.
- Watch the Logistics map after each market turn. New industrial capacity can create new haul demand.
- Compare your freight price with the cost of inputs used by physical industries. A freight shortage can raise costs across manufacturing, agriculture, chemicals, extraction, and construction.
- Use a focused logistics strategy only when its output and input mix match the shortage you are trying to serve.

### Capacity versus strength

These names are easy to confuse:

- **Freight capacity** is market output from logistics sectors. It moves goods between states and appears on the commodity page and Logistics map.
- **Corporate logistics strength** is an internal corporation stat built by the CEO's logistics budget. It reduces the sprawl penalty from operating many sectors, and it cuts the freight bill and the landed-price surcharge your plants pay on inputs bought from other states, by up to 40% at a strength of 200. Logistics sectors themselves are exempt from the sprawl penalty but still count toward the sector total. Strength nodes in [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d) cut your freight bill, and strength is also the operations pillar of [Output Quality](/wiki/output-quality).

Spending on corporate logistics strength does not create TEU. Opening and operating a logistics sector does.

Eras and countries without a modelled freight network have no Logistics map. Last checked 2026-10-29, version 1.18.0. This guide has no separate design page.
`;
