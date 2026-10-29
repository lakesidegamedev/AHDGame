export const householdEconomyContent = `# Household Demand & Price Level

Your retail sector has capacity and still sells poorly. Before blaming your price, look at the customers. **Households** are the end customers of the economy: every state's population buys a basket of finished goods and services, and how much it buys depends on jobs, income, confidence and prices. This is the demand that retail, food, energy, vehicles and many other sectors ultimately sell into.

## What sets the size of the basket

Each turn every state generates demand for a basket that includes food, energy, retail goods, vehicles, electronics, medicine, housing, finance, networks, software, freight and professional services. The size of the budget is tied to **population**, not to GDP, so countries with very different currencies stay comparable. Three state signals then adjust it, and all three are on the [National Metrics](/wiki/national-metrics) page:

- **Unemployment:** lower unemployment raises demand and high unemployment cuts it.
- **Consumer confidence:** moves demand within a bounded range.
- **Median income:** compared with the country's own average, never with another country's currency.

Check these first when a consumer sector sells below expectation. Hiring and wage choices move unemployment and median income through [Labour & Wages](/wiki/labour-and-wages), and policymakers who lift employment or confidence raise household demand across the board.

Wealth changes the **mix** of the basket, not its size (Engel's law). Richer states spend a smaller share on staples and a larger share on vehicles, electronics, housing, finance and software, so sell goods that fit the local basket.

![Population sets the household budget, three state signals adjust it, then wealth changes the basket mix, elasticity and a supply cap lead to commodity demand.](/wiki-images/diagrams/household-economy-demand-flow.svg)

| Rule | Value |
| --- | --- |
| Budget base | Population times a per-person spend |
| Household demand cap per commodity | 1.5 times the previous turn's global supply of that commodity |
| Household price index start | 1.0 |
| Index pass-through | 75% of annual inflation, compounded each turn |
| Turns per game year | 48 |

## When prices move

Households buy less of a [commodity](/wiki/commodities) when its price rises above the era's base price and more when it falls below. Staples such as food, energy, healthcare and medicine barely respond to price. Vehicles, electronics and software respond strongly. Rising prices therefore destroy some discretionary demand while staples hold up, which stabilises the market, so keep consumer goods competitive on price.

The cap exists so a tiny new market cannot be assigned impossible demand that no amount of building could satisfy. If food had 100,000 units of world supply last turn, household demand for it cannot exceed 150,000 this turn. A glut of supply against a fixed population budget lowers your fill. Household demand is the end market for [corporations](/wiki/corporations) in retail and other consumer sectors, so it sets their fill and revenue.

## The household price index

Each country also carries a household price index that starts at 1.0. Every turn it grows by 75% of the annual inflation rate, spread over 48 turns. In practice, after one game year at 8% inflation the index is 1 + 0.75 x 8% = **1.06**; after two years it is about 1.124. The index is a record of the price level, not an input into inflation.

\`\`\`wiki-chart
household-price-index-by-inflation
\`\`\`

Median income in a state rises from 50,000 to 55,000 over two game years while inflation runs at 8%. The household price index reaches about 1.124. In launch-price terms, income is 55,000 / 1.124 = **48,900**, which is lower than the 50,000 you started with. Your nominal income rose 10% but your real purchasing power fell about 2%. The economy panel shows this purchasing power figure.

Command economies set prices and distribution through the plan; see [Planned / Command Economies](/wiki/planned-economies).

Applies in current worlds, where it replaces the older flat demographic demand uplift; older worlds created before it may still use the flat uplift. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
