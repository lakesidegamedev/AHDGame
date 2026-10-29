export const tariffsContent = `# Tariffs

A tariff is a trade barrier a legislature passes by bill. It cuts the profit margin of foreign corporations operating in the country that imposed it, slightly hurts domestic firms through higher input costs, and tilts how sectors are priced and how they fight for market share. If you run a corporation abroad, a tariff is the line item that turns your margin negative. If you legislate, it is your main tool against foreign competition.

## How it works

A tariff applies to a sector only when the sector operates **in the country that imposed it**. A US tariff on Chinese corporations does not touch Chinese sectors operating in Germany.

### Key numbers

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

### Worked example: a 25% economy-wide tariff

Germany passes a 25% economy-wide tariff.

- A foreign steel sector operating in Germany loses 12.5 percentage points of margin (25 / 2).
- A German steel sector pays no tariff but loses 2.5 points of margin from costlier inputs (25 / 10).
- If Germany also has one +7.5 point [subsidy](/wiki/subsidies), the German sector nets +5 points, while the foreign sector is still at -12.5 points, a 17.5 point gap between them.
- The commodity margin blend moves a quarter of the way: global weight 43.75%, national 31.25%, local 25%.
- In a market share fight (a sector split attack), a domestic attacker gets x1.125 and a foreign attacker x0.875.

The halving of the foreign penalty keeps a high tariff from wiping out foreign operations instantly, while still making them clearly costlier.

## Scope types

| Scope | Target | Example |
| --- | --- | --- |
| Economy-wide | All foreign corporations in the country | "25% tariff on all imports" |
| Sector | Foreign corporations of one sector type | "30% on foreign steel producers" |
| Origin country | Corporations headquartered in one country | "40% on German corporations" |
| Corporation | One named corporation | Targeted sanction on one entity |

Re-enacting the same scope and target at a new rate replaces the old record.

### Stacking

Tariffs that match a sector add together, up to 100%:

| Active tariffs | Effective rate |
| --- | --- |
| 20% economy-wide | 20% |
| 20% economy-wide + 15% sector | 35% |
| 20% economy-wide + 10% origin-country | 30% |

Domestic malus uses only economy-wide and sector tariffs. Origin-country and corporation tariffs target foreign firms only.

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

## What you can do

- **Legislators:** draft a bill with a tariff provision from the bill drafting screen. Choose the scope, target and rate. Tip: a narrow tariff leaves the rest of the economy alone, since only economy-wide and sector tariffs carry a domestic malus.
- **Legislators:** to remove a tariff, pass a new bill for the same scope and target with a rate of 0. The old record stays in history but no longer applies.
- **Corporation owners:** open the Congress view to see active tariffs, then check each foreign sector's margin. If a tariff is eating your margin, change sectors, or push for a free trade agreement.
- **Tip:** a domestic-only [subsidy](/wiki/subsidies) plus a tariff makes a two-sided policy: help for home firms, a penalty for foreign ones.

## Free trade agreements

Free trade agreements (FTAs), passed in an international organization both countries belong to, switch tariffs off between partners:

- The effective rate between FTA partners is **0**, whatever tariffs are on the books. A corporation headquartered in a partner country pays nothing.
- The domestic malus, the blend tilt and the inflation pressure shrink in proportion to how much of the foreign footprint the partners cover.
- Tariffs do not fire a negative sentiment pulse against partner-headquartered firms. If an FTA is later rescinded, sector tariffs in the affected countries fire a fresh foreign-side pulse.

Non-partner foreign firms get no relief.

## Inflation and market sentiment

Tariffs feed **cost-push inflation** (prices rise because things cost more to make). Each turn the game boils the active tariffs into one pressure number from 0 to 100. Economy-wide tariffs count in full, and narrower ones in proportion to the domestic sector revenue they touch. Pressure above a 3% baseline adds to inflation; pressure below is mildly deflationary.

When a **sector** tariff is enacted the market also reacts: corporations headquartered in the country get a +7% sentiment boost, and foreign corporations there a -7% penalty. Sentiment pulses decay at 0.82 per 15-minute market interval, and the total is capped at plus or minus 25%. Economy-wide, origin-country and corporation tariffs do not fire pulses.

Economy-wide tariff rates also feed the federal budget's tariff revenue projection (import value x tariff rate). Narrower tariffs affect margins and inflation only.

## Common questions

- **Why are my margins negative after a tariff?** A foreign sector loses half the effective rate in margin points. A 40% effective rate is -20 points. Check the Congress view for stacked tariffs.
- **Does an FTA turn tariffs off?** Yes, between partner countries.
- **Do domestic companies pay tariffs?** No, but they take a smaller malus from broad tariffs (up to -10 points at 100%).
- **How do I remove a tariff?** Pass a bill for the same scope with a 0% rate.
- **How do tariffs affect inflation?** Through cost-push pressure above a 3% baseline.

## Connections

**Driven by**

- [Bills & Legislation](/wiki/bills-legislation): a bill with a tariff provision creates, changes or removes a tariff.

**Affects**

- [Subsidies](/wiki/subsidies): used alongside tariffs in industrial policy; the margins add together.
- [Corporations](/wiki/corporations): changes the profit margin of foreign and domestic sectors and the outcome of market share fights.
- [Commodities](/wiki/commodities): moves margin blend weight from the global price to the national price.
- Inflation: adds cost-push pressure above the baseline.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): Tariffs add to landed cost and can price a route out.
- [National Budget](/wiki/national-budget): Tariff rates and import value set tariff revenue.
- [National Metrics](/wiki/national-metrics): Tariffs above their baseline add cost pressure to inflation.

## Status

Tariffs work in any country where legislators can pass an industry bill with a tariff provision. FTAs apply only between countries in the same international organization that has passed one.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants and edge cases are on the [tariffs design page](https://docs.lakesidegames.net/design/tariffs.html).
`;
