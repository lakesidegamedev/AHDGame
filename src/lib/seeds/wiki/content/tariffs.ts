export const tariffsContent = `# Tariffs

Your steel sector is profitable in Germany until Germany passes a 25% economy-wide tariff, and suddenly it is 12.5 percentage points thinner. A tariff is a trade barrier a legislature passes by bill. It cuts the profit margin of foreign corporations operating in the country that imposed it, slightly hurts domestic firms through higher input costs, and tilts how sectors are priced and how they fight for market share. If you run a corporation abroad, it is the line item that turns your margin negative. If you legislate, it is your main tool against foreign competition.

A tariff applies to a sector only when the sector operates **in the country that imposed it**. A US tariff on Chinese corporations does not touch Chinese sectors operating in Germany.

![An enacted tariff becomes an effective rate that feeds six effects: foreign margin penalty, domestic malus, commodity blend tilt, market capture, inflation pressure and a sentiment pulse.](/wiki-images/diagrams/tariffs-effect-fan-out.svg)

| Rule | Value |
| --- | --- |
| Foreign sector margin penalty | Half the effective tariff rate |
| Domestic sector malus | Combined economy-wide and sector rate / 10, at most -10 percentage points |
| Effective rate cap | 100% |
| Domestic corporations | Pay no tariff |
| Free trade partners | Effective rate is 0% |
| Commodity margin blend with no tariff | 50% global, 25% national, 25% local |
| Commodity margin blend at a 100% tariff | 25% global, 50% national, 25% local |
| Market capture at a 100% tariff | Domestic attacker x1.5, foreign attacker x0.5 |
| Inflation baseline | 3% tariff pressure |

## Writing a tariff

Tariffs come from a bill in [Bills & Legislation](/wiki/bills-legislation): a bill with a tariff provision creates, changes or removes one. Draft it from the bill drafting screen and choose the scope, target and rate. A narrow tariff leaves the rest of the economy alone, since only economy-wide and sector tariffs carry a domestic malus.

| Scope | Target | Example |
| --- | --- | --- |
| Economy-wide | All foreign corporations in the country | "25% tariff on all imports" |
| Sector | Foreign corporations of one sector type | "30% on foreign steel producers" |
| Origin country | Corporations headquartered in one country | "40% on German corporations" |
| Corporation | One named corporation | Targeted sanction on one entity |

Re-enacting the same scope and target at a new rate replaces the old record. To remove a tariff, pass a new bill for the same scope and target with a rate of 0. The old record stays in history but no longer applies.

Tariffs that match a sector add together, up to 100%:

| Active tariffs | Effective rate |
| --- | --- |
| 20% economy-wide | 20% |
| 20% economy-wide + 15% sector | 35% |
| 20% economy-wide + 10% origin-country | 30% |

Domestic malus uses only economy-wide and sector tariffs. Origin-country and corporation tariffs target foreign firms only.

## What it does to a sector's margin

Say Germany passes a 25% economy-wide tariff.

- A foreign steel sector operating in Germany loses 12.5 percentage points of margin (25 / 2).
- A German steel sector pays no tariff but loses 2.5 points of margin from costlier inputs (25 / 10).
- If Germany also has one +7.5 point [subsidy](/wiki/subsidies), the German sector nets +5 points, while the foreign sector is still at -12.5 points, a 17.5 point gap between them.
- The commodity margin blend moves a quarter of the way: global weight 43.75%, national 31.25%, local 25%.
- In a market share fight (a sector split attack), a domestic attacker gets x1.125 and a foreign attacker x0.875.

The halving of the foreign penalty keeps a high tariff from wiping out foreign operations instantly, while still making them clearly costlier.

| Effective rate | Foreign margin penalty | Domestic malus | Domestic attacker | Foreign attacker |
| --- | --- | --- | --- | --- |
| 0% | 0 | 0 | x1.0 | x1.0 |
| 25% | -12.5 | -2.5 | x1.125 | x0.875 |
| 50% | -25 | -5 | x1.25 | x0.75 |
| 100% | -50 | -10 | x1.5 | x0.5 |

(Margin figures are percentage points.)

\`\`\`wiki-chart
tariff-margin-effects
\`\`\`

\`\`\`wiki-chart
tariff-blend-and-capture
\`\`\`

If your margins are negative after a tariff, a foreign sector loses half the effective rate in margin points: a 40% effective rate is -20 points. Open the Congress view to see active tariffs, including stacked ones, then check each foreign sector's margin. If a tariff is eating your margin, change sectors, or push for a free trade agreement. A domestic-only [subsidy](/wiki/subsidies) plus a tariff makes a two-sided policy: help for home firms, a penalty for foreign ones, and the margins add together.

How a tariff reshapes [Corporations](/wiki/corporations) comes down to the profit margin of foreign and domestic sectors and the outcome of market share fights. It also moves margin blend weight from the global price to the national price in [Commodities](/wiki/commodities).

## Free trade agreements

Free trade agreements (FTAs), passed in an international organization both countries belong to, switch tariffs off between partners:

- The effective rate between FTA partners is **0**, whatever tariffs are on the books. A corporation headquartered in a partner country pays nothing.
- The domestic malus, the blend tilt and the inflation pressure shrink in proportion to how much of the foreign footprint the partners cover.
- Tariffs do not fire a negative sentiment pulse against partner-headquartered firms. If an FTA is later rescinded, sector tariffs in the affected countries fire a fresh foreign-side pulse.

Non-partner foreign firms get no relief.

## Inflation, budget and sentiment

Tariffs feed **cost-push inflation** (prices rise because things cost more to make). Each turn the game boils the active tariffs into one pressure number from 0 to 100. Economy-wide tariffs count in full, and narrower ones in proportion to the domestic sector revenue they touch. Pressure above a 3% baseline adds to inflation; pressure below is mildly deflationary. That cost pressure shows up in [National Metrics](/wiki/national-metrics).

When a **sector** tariff is enacted the market also reacts: corporations headquartered in the country get a +7% sentiment boost, and foreign corporations there a -7% penalty. Sentiment pulses decay at 0.82 per 15-minute market interval, and the total is capped at plus or minus 25%. Economy-wide, origin-country and corporation tariffs do not fire pulses.

Economy-wide tariff rates also feed the [National Budget](/wiki/national-budget) tariff revenue projection (import value x tariff rate). Narrower tariffs affect margins and inflation only. In trade, tariffs add to landed cost and can price a route out; see [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide).

Tariffs work in any country where legislators can pass an industry bill with a tariff provision. FTAs apply only between countries in the same international organization that has passed one. Last checked 2026-10-29, version 1.18.0. Exact rules: [Tariffs (design)](https://docs.lakesidegames.net/design/tariffs.html)
`;
