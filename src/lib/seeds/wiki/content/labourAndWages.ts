export const labourAndWagesContent = `# Labour & Wages

**Labour** is an explicit cost in every corporate sector, and you control part of it with a **wage level** slider. Pay more and costs rise, but workers stay content, your products can be better and your R&D works harder. Pay less and margins improve now, but unionization, strikes and worse macro conditions follow later. The country's **minimum wage** floor and the wider economy push back on whatever you choose.

Wage level 1.0 is your industry's normal pay. Payroll at 1.0 is already billed as a cost, so the slider moves your bill up or down from there.

## Setting wages

As CEO, set the wage level on a sector's detail panel, between 0.8 and 1.5. The change applies to next turn's labour cost. The same panel shows your industry's typical pay against the median industry, and a tag when a minimum-wage floor is lifting your labour cost.

Each sector's payroll is billed as its own cost line, next to inputs and plant overhead:

> labour cost = labour share x payroll basis x wage level x union premium x minimum-wage floor x automation

- **Labour share** is how much of revenue goes to pay in that sector type. It is higher in a technology firm than in an energy firm (table below).
- **Payroll basis** is the value, at nominal prices, of the output your active plants are scheduled to run, scaled to the share of the crew you actually staffed. Idle lines employ no one.
- **Wage level** is your slider. 1.0 is baseline.
- **Union premium** is the surcharge from [Unions](/wiki/unions), up to 15%.
- **Minimum-wage floor** lifts the cost only in sectors paying less than the floor.
- **Automation** is the cut from automation tech, which can take up to half off the bill.

| Rule | Value |
| --- | --- |
| Wage level range | 0.8 to 1.5, default 1.0 |
| Era labour multiplier | x1.0 from 2007, x1.1 from 1991, x1.25 from 1953, x1.35 before |
| Minimum wage ceiling | Kaitz ratio up to 1.0 (a floor at the median wage) |
| Median sector pay level | 1.1 |
| Union premium | Up to 15% of labour cost, scaled with unionization |
| Wage-driven unemployment change | Only in a region with no labour-force figure: 1.5 points per 1.0 change in the state wage index, at most 1.5 points a turn |
| Automation-driven unemployment change | Only in a region with no labour-force figure: 2.5 points per 1.0 change in the automation index, at most 1.5 points a turn |

Profit changes by labour share x (level - 1) x payroll basis, so on a full run a 0.1 move is worth about 1.6 points of revenue in manufacturing and 3.5 in technology.

| Sector | Labour share of revenue (modern era) | Pay level |
| --- | ---: | ---: |
| Technology | 35.0% (26.25% on the hardware strategy) | 1.8 |
| Financial | 32.5% | 1.7 |
| Healthcare | 27.7% | 1.3 |
| Media | 28.0% | 1.1 |
| Entertainment (media line) | 28.0% | 0.85 |
| Construction | 26.4% | 0.9 |
| Defense | 24.0% | 1.3 |
| Telecommunications | 20.0% | 1.2 |
| Retail | 19.1% | 0.6 |
| Real estate | 19.1% | 0.9 |
| Logistics | 18.0% | 0.8 |
| Agriculture | 16.0% | 0.55 |
| Manufacturing | 15.9% | 0.95 |
| Chemical industries | 15.0% | 1.2 |
| Vehicle manufacturing | 14.1% | 1.0 |
| Extraction | 12.0% | 1.1 |
| Energy | 10.0% | 1.2 |

Labour share sets your cost. Pay level is a separate table: it decides which sectors a minimum wage lifts, and it is the pay figure the wage panel shows against the median industry. Headcount does not depend on the sector type: every sector employs workers in proportion to its output, with fewer workers in states with a more skilled workforce. Keeping pay level apart from labour share is what lets a minimum wage bite the low-paid sectors (retail, agriculture) rather than simply the labour-heavy ones.

A fully staffed manufacturing sector in a modern world runs output worth ₳1,000,000 a day at nominal prices and sells it all. At wage level 1.0 its labour cost is 15.9% x 1,000,000 = **₳159,000**.

- Wage level **1.2**: labour costs ₳190,800, ₳31,800 more. Margin falls by 3.2 points.
- Wage level **0.8**: labour costs ₳127,200, ₳31,800 less, and margin rises 3.2 points. But the real wage drops to 0.8, which raises the unionization target by 8 points in a sector no union represents, and pay now sits below what workers expect, which can start a strike if the sector is already heavily unionized.

\`\`\`wiki-chart
wage-level-margin-change
\`\`\`

## What the slider buys you

A cheap-labour strategy gives margin now and unionization later. A high-wage strategy costs margin but buys quality, R&D and calm. Think in lanes, not spikes.

- **Quality:** the wage level feeds the wages pillar of [Output Quality](/wiki/output-quality), 20% of the blend. Going from 1.0 to 1.5 lifts that pillar from 0.5 to 0.8, which is worth about 10% of your quality score at the maximum.
- **R&D:** wages above baseline lift R&D efficiency by up to 15%, wages below lower it (see [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d)). Tech nodes there can also cut labour cost by up to 50% through automation. Automation lowers the bill without changing your headcount.
- **Unionization:** in a sector no union represents, a real wage (your wage level against the local cost of living) below 1.0 raises the unionization target, which adds a premium. A represented sector drifts toward its union's approval instead. A cut also leaves pay below what workers expect, and expectations only catch up slowly, so a sector above 55% unionization can strike. A strike you wait out adds 10 points of unionization. If unions appeared after you cut wages, this is why, and [Unions](/wiki/unions) covers what follows.

## When the state sets a floor

A minimum wage matters only if your sector pays below it. Say the country has a minimum wage with a Kaitz ratio of 0.7. The floor is 0.7 x 1.1 = 0.77 on the pay scale. Retail (0.6) must lift pay by 0.77 / 0.6, so its labour costs rise **28%**. Agriculture (0.55) rises **40%**. Manufacturing at 0.95 is untouched. In general it raises your labour cost by the ratio of the floor to your sector's pay level.

The floor is not a bill players can pass today: the game team sets it for each country, and minimum wage bills in the legislature do not change it, so watch the sector panel to see whether your sector is being lifted. What legislators can pass is union law, through [Bills & Legislation](/wiki/bills-legislation), which shapes how strongly unions form.

## What wages do to the state

Your slider moves a state's **wage index**, the worker-weighted average of wage levels (times any minimum-wage floor) in the state. Median income responds to *changes* in that index as a one-time nudge; migration responds to its level. [National Metrics](/wiki/national-metrics) shows the results:

| Channel | Effect |
| --- | --- |
| **Median income** | A rise in the wage index nudges median income growth up. |
| **Unemployment** | Wages do not move unemployment directly: it comes from the jobs employers want against the people available. Where employers want more workers than the state has, a sector paying above the state's average wage level staffs a larger share of what it wants. Only in a region with no labour-force figure does a 0.10 rise add 0.15 points to the unemployment target. |
| **Migration** | A region with above-baseline wages attracts more migrants, and below-baseline regions lose some. |

One [corporation](/wiki/corporations) moves the state index only in proportion to its share of the state's workers, so a lone slider has a small effect, and labour cost is a direct part of each sector's margin. A country-wide shift, such as a minimum-wage rise, moves it a lot.

![How a wage level moves the state wage index and the economy, and how wages lagging worker expectations push unionization and strike risk up.](/wiki-images/diagrams/labour-and-wages-wage-feedback.svg)

See also: [Pensions](/wiki/pensions), where the covered wage bill sets both the contribution and the accrual.

Applies in current worlds, with labour shares higher in older eras (see the era multiplier). Command economies are closed to new private sector expansion, so most pay there is set by state-owned enterprises. Last checked 2026-10-30, version 1.18.0. Exact rules: [Labour design page](https://docs.lakesidegames.net/design/labour.html)
`;
