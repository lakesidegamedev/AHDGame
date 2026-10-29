export const householdEconomyContent = `# Household Demand & Price Level

**Households** are the end customers of the economy. Every state's population buys a basket of finished goods and services, and how much it buys depends on jobs, income, confidence and prices. This is the demand that retail, food, energy, vehicles and many other sectors ultimately sell into. If your product sells poorly even though you have capacity, weak household demand is one of the first things to check.

## How it works

Each turn every state generates demand for a basket that includes food, energy, retail goods, vehicles, electronics, medicine, housing, finance, networks, software, freight and professional services. The size of the budget is tied to **population**, not to GDP, so countries with very different currencies stay comparable. Three state signals then adjust it:

- **Unemployment:** lower unemployment raises demand and high unemployment cuts it.
- **Consumer confidence:** moves demand within a bounded range.
- **Median income:** compared with the country's own average, never with another country's currency.

Wealth changes the **mix** of the basket, not its size (Engel's law). Richer states spend a smaller share on staples and a larger share on vehicles, electronics, housing, finance and software.

![Population sets the household budget, three state signals adjust it, then wealth changes the basket mix, elasticity and a supply cap lead to commodity demand.](/wiki-images/diagrams/household-economy-demand-flow.svg)

### Key numbers

| Rule | Value |
| --- | --- |
| Budget base | Population times a per-person spend |
| Household demand cap per commodity | 1.5 times the previous turn's global supply of that commodity |
| Household price index start | 1.0 |
| Index pass-through | 75% of annual inflation, compounded each turn |
| Turns per game year | 48 |

### Price elasticity

Households buy less of a commodity when its price rises above the era's base price and more when it falls below. Staples such as food, energy, healthcare and medicine barely respond to price. Vehicles, electronics and software respond strongly. Rising prices therefore destroy some discretionary demand while staples hold up, which stabilises the market.

The cap exists so a tiny new market cannot be assigned impossible demand that no amount of building could satisfy. If food had 100,000 units of world supply last turn, household demand for it cannot exceed 150,000 this turn.

### Household price index

Each country also carries a household price index that starts at 1.0. Every turn it grows by 75% of the annual inflation rate, spread over 48 turns. In practice, after one game year at 8% inflation the index is 1 + 0.75 x 8% = **1.06**; after two years it is about 1.124. The index is a record of the price level, not an input into inflation.

\`\`\`wiki-chart
household-price-index-by-inflation
\`\`\`

### Worked example

Median income in a state rises from 50,000 to 55,000 over two game years while inflation runs at 8%. The household price index reaches about 1.124. In launch-price terms, income is 55,000 / 1.124 = **48,900**, which is lower than the 50,000 you started with. Your nominal income rose 10% but your real purchasing power fell about 2%. The economy panel shows this purchasing power figure.

## What you can do

- **Check unemployment, confidence and median income** in [National Metrics](/wiki/national-metrics) when a consumer sector sells below expectation.
- **Sell goods that fit the local basket.** Rich states buy more vehicles and electronics, poor ones more staples.
- **Keep consumer goods competitive on price.** Discretionary items lose demand fastest when prices rise.
- **Move jobs and wages.** Hiring and wage choices change unemployment and median income through [Labour & Wages](/wiki/labour-and-wages), which feeds household demand.
- **As a policymaker,** fiscal and monetary choices that lift employment or confidence raise household demand across the board.

### Common questions

- **Why is demand for my product low when I have capacity?** Household demand depends on the state's employment, confidence and income, and on price. A glut of supply against a fixed population budget lowers your fill.
- **What decides how much people buy?** Population sets the budget; employment, confidence, income and prices adjust it.
- **How do wages feed demand?** Wage changes move median income and unemployment, which move household demand.

## Connections

**Driven by**

- [National Metrics](/wiki/national-metrics): unemployment, confidence, median income and inflation set the demand level and the price index.
- [Commodities](/wiki/commodities): commodity prices above or below base reduce or raise what households buy.

**Affects**

- [Commodities](/wiki/commodities): household demand is the end market for consumer goods and services.
- [Corporations](/wiki/corporations): retail and other consumer sectors sell into this demand, so it sets their fill and revenue.
- [National Metrics](/wiki/national-metrics): the price index sets real purchasing power in the economy panel.

## Status

Household demand is live in current worlds and replaces the older flat demographic demand uplift. Older worlds created before it may still use the flat uplift. Command economies set prices and distribution through the plan; see [Planned / Command Economies](/wiki/planned-economies).

Last checked: 2026-10-29, version 1.18.0

## Technical detail

This system has no separate design page yet. The numbers above are the full set, and the supply and price side is on [Commodities](/wiki/commodities).
`;
