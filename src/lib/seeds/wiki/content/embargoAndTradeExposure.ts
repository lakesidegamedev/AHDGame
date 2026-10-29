export const embargoAndTradeExposureContent = `# Embargoes & Trade Exposure

You want to hurt another country's economy, and you have two tools: a quick embargo that fades, or a law that stays. A trade minister can impose one immediately but only for a limited time. A bill can put a durable one on the books. When a country cuts off another completely, the target's corporations operating inside it lose their export sales, and how much they lose depends on how much of their business actually crossed the border.

## Choosing how to impose one

| | Ministerial embargo | Legislated embargo |
| --- | --- | --- |
| Who | The trade minister, from the cabinet office page | A bill that passes |
| Speed | Immediate | After the bill is signed |
| Lasts | Up to 96 turns, 2 game years | Until repealed |
| How it ends | Expires, or the minister lifts it | An end-embargo provision in a later bill |
| Cost | One cabinet action | The bill process |

Embargoes can also come from an international organization resolution or a crisis outcome. Those follow their own rules. Only the minister and legislation paths are described here.

If you are your country's trade minister, open your [cabinet](/wiki/cabinet) office page and use the **Trade embargoes** panel, which spends cabinet actions. Pick the target, commodity, direction, block or cap, and a duration up to 96 turns. Use the Lift button on the same panel to end it early. To make it durable, write an embargo provision into a [bill](/wiki/bills-legislation); only a later bill can end it. Allies can be embargoed. The only blocked target is your own country.

Each embargo picks:

- A commodity, or **all** commodities.
- A direction: exports, imports or both, from the imposing country's point of view.
- **Block** (the flow stops) or **cap** (the flow is limited to a set amount of units).

| Item | Value |
| --- | --- |
| Cabinet action cost | 1 per ministerial embargo |
| Longest ministerial embargo | 96 turns, 2 game years |
| Active ministerial embargoes per member | 2 |
| Cooldown on the same target after a ministerial embargo | 168 turns, 3.5 game years, counted from when it was enacted |

The cooldown stops a minister re-imposing the same embargo the moment it lapses. Lifting an embargo early does not reset it, so if you need the pressure to last past the cooldown, use legislation. The game also blocks a second embargo that would cover the same country pair, commodity and direction while the first is active, and a country cannot embargo itself. Embargoed flows are blocked or capped in the clearing of the [Trade System](/wiki/trade-system). A [blockade](/wiki/blockades) stacks with an embargo: an embargo blocks a lane outright and a blockade scales what affinity is left.

## What a total embargo does to a corporation

The strong corporate effect applies to a **total embargo**: all commodities, blocked, both directions. Under it, a corporation from the target country that operates in the embargoing country keeps running on domestic demand and loses only the share of its output that was sold abroad. The pain lands on its corporations operating in your territory, not on its home economy directly.

![Steps a total embargo applies to a corporation sector: export exposure, scaled revenue and maintenance, a dropped export premium, and unchanged fixed overhead.](/wiki-images/diagrams/embargo-and-trade-exposure-total-embargo-effects.svg)

1. Each sector has an **export exposure**: for each commodity it makes, the share of its country's surplus that cleared abroad the previous turn, averaged over the sector's output mix, from the [Trade System](/wiki/trade-system).
2. Revenue is multiplied by 1 minus the exposure. A pure exporter collapses toward zero. A sector mostly serving local demand barely notices.
3. Maintenance costs scale down with the lower revenue, so the domestic remainder runs at its normal margin.
4. The export-premium margin bonus is dropped, because the sales that earned it are gone. That bonus is worth up to 6 margin points.
5. Fixed corporation-level overhead (marketing, logistics, R&D, executive pay) is not reduced. That is the real drag.

| Item | Value |
| --- | --- |
| Share of exposed export revenue lost under a total embargo | 100% |
| Export-premium margin bonus on an embargoed sector | Removed |

A narrower embargo, for one commodity, one direction or capped, restricts the trade flow itself but does not trigger this revenue write-down for in-country operations.

An embargo restricts goods crossing a border, not what a locally operating subsidiary sells to local customers. An earlier model shut such sectors down completely, even when none of their output was exported. That was wrong and hid the loss in the financials, so the game now removes only the cross-border share.

### One sector, 70% exposed

A sector earns revenue of 100 per turn at a 20% margin, which includes a 4-point export premium. So its base margin is 16%. Its exposure is 70%.

- Before: revenue 100, costs 80, profit 20.
- After a total embargo: revenue = 100 times (1 minus 0.70) = 30.
- Margin falls to 16% with no premium: costs scale to 25.2, profit 4.8.
- Overhead stays the same, so if the corporation carried 10 of fixed overhead on this sector, profit swings from 10 to negative 5.2.

A sector with 10% exposure would keep 90 of revenue and lose far less.

\`\`\`wiki-chart
embargo-revenue-kept
\`\`\`

To defend a [corporation](/wiki/corporations), check how much of each sector's output is sold to one country before relying on that revenue; an embargoed sector shows lower realized revenue than its nameplate revenue in the sector financials. A sector with exposure near 100% loses almost everything. A ministerial embargo against you is temporary, so a corporation can often ride out the export loss. A bill embargo does not expire; it stays until a later bill ends it.

Applies in every current world. The corporate revenue effect applies to total embargoes. Ministerial and legislated embargoes both work wherever a country has a trade minister and a legislature. Last checked 2026-10-29, version 1.18.0. There is no separate technical page yet and the numbers above are the exact rules; for the wider trade model, see [Trade System](/wiki/trade-system)
`;
