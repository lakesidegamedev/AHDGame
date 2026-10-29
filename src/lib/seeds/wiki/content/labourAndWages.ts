export const labourAndWagesContent = `# Labour & Wages

**Labour** is an explicit cost in every corporate sector, and you control part of it with a **wage level** slider. Pay more and costs rise, but workers stay content, your products can be better and your R&D works harder. Pay less and margins improve now, but unionization, strikes and worse macro conditions follow later. The country's **minimum wage** floor and the wider economy push back on whatever you choose.

At the default setting the economy matches what it was before wages existed, so only deviations move the numbers.

## How it works

Each sector's labour cost is carved out of its existing running costs, never added on top:

> labour cost = labour share x daily revenue x wage level x union premium x minimum-wage floor

- **Labour share** is how much of revenue goes to pay in that sector type. It is higher in a technology firm than in an energy firm (table below).
- **Wage level** is your slider. 1.0 is baseline.
- **Union premium** is the surcharge from [Unions](/wiki/unions), up to 15%.
- **Minimum-wage floor** lifts the cost only in sectors paying less than the floor.

Each sector is also modelled as workers times pay per worker. High-skill sectors (technology, financial) employ fewer people at higher pay. Low-skill ones (retail, agriculture) employ many at lower pay. That split is what lets a minimum wage bite low-paid sectors specifically.

### Key numbers

| Rule | Value |
| --- | --- |
| Wage level range | 0.8 to 1.5, default 1.0 |
| Era labour multiplier | x1.0 from 2007, x1.1 from 1991, x1.25 from 1953, x1.35 before |
| Minimum wage ceiling | Kaitz ratio up to 1.0 (a floor at the median wage) |
| Median sector pay level | 1.1 |
| Union premium | Up to 15% of labour cost, scaled with unionization |
| Wage-driven unemployment change | 1.5 points per 1.0 change in the state wage index, at most 1.5 points a turn |
| Automation-driven unemployment change | 2.5 points per 1.0 change in the automation index, at most 1.5 points a turn |

### Labour share and pay level by sector

| Sector | Labour share of revenue (modern era) | Pay level |
| --- | ---: | ---: |
| Technology | 35.0% | 1.8 |
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

Labour share sets your cost. Pay level only decides which sectors a minimum wage affects and what the sector page shows as implied pay per worker.

### Worked example

A manufacturing sector earns ₳1,000,000 of revenue a day in a modern world. At wage level 1.0 its labour cost is 15.9% x 1,000,000 = **₳159,000**.

- Wage level **1.2**: labour costs ₳190,800, ₳31,800 more. Margin falls by 3.2 points.
- Wage level **0.8**: labour costs ₳127,200, ₳31,800 less, and margin rises 3.2 points. But real wages then fall behind what workers expect, which pushes unionization up (see [Unions](/wiki/unions)).

Now the country has a minimum wage with a Kaitz ratio of 0.7. The floor is 0.7 x 1.1 = 0.77 on the pay scale. Retail (0.6) must lift pay by 0.77 / 0.6, so its labour costs rise **28%**. Agriculture (0.55) rises **40%**. Manufacturing at 0.95 is untouched.

### What wages do beyond cost

- **Quality:** the wage level feeds the wages pillar of [Output Quality](/wiki/output-quality), 20% of the blend. Going from 1.0 to 1.5 lifts that pillar from 0.5 to 0.8.
- **R&D:** wages above baseline lift R&D efficiency by up to 15%, wages below lower it (see [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d)).
- **Unionization:** pay that lags worker expectations pushes unionization up, which adds a premium and risks strikes.
- **Automation:** tech nodes that automate can cut labour cost by up to 50%, but they also add to unemployment.

### Macro feedback (wages to the economy)

Your slider moves a state's **wage index**, the worker-weighted average of all pay multipliers in the state. The economy responds to *changes* in that index as a one-time nudge, not to its level:

| Channel | Effect |
| --- | --- |
| **Median income** | A rise in the wage index nudges median income growth up. |
| **Unemployment** | A 0.10 rise adds 0.15 points of unemployment (capped at 1.5 points a turn). A drop lowers it. |
| **Migration** | A region with above-baseline wages attracts more migrants, and below-baseline regions lose some. |

One corporation moves the state index only in proportion to its share of the state's workers, so a lone slider has a small effect. A country-wide shift, such as a minimum-wage rise, moves it a lot.

## What you can do

- **Set the wage level** on a sector's detail panel, between 0.8 and 1.5. The change applies to next turn's labour cost.
- **Read the implied wage versus the state median** on the same panel to see whether you pay above or below the local economy.
- **Vote on union law.** Union-law bills are passed by legislators (see [Bills & Legislation](/wiki/bills-legislation)). The minimum-wage floor that sets labour cost is not a bill players can pass today: the game team sets it for each country, so watch the sector panel to see whether your sector is being lifted.
- **Think in lanes, not spikes.** A cheap-labour strategy gives margin now and unionization later. A high-wage strategy costs margin but buys quality, R&D and calm.

### Common questions

- **What does the slider do to my profit?** Profit changes by labour share x (level - 1) x revenue, so a 0.1 move is worth 1.5 points of revenue in manufacturing and 3.5 in technology.
- **Does paying more raise quality?** Yes, through the wages pillar, but it is worth about 10% of your quality score at the maximum.
- **Why did unions appear after I cut wages?** Real wages below what workers expect push unionization up.
- **How does minimum wage affect me?** Only if your sector pays below the floor. It raises your labour cost by the ratio of the floor to your sector's pay level.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): the wage level you set and your sector mix decide your labour cost.
- [Unions](/wiki/unions): unionization adds a standing premium of up to 15%.
- [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d): automation nodes cut labour cost.
- [Bills & Legislation](/wiki/bills-legislation): union-law bills shape how strongly unions form. The minimum-wage floor is set by the game team, not by a bill.

**Affects**

- [Corporations](/wiki/corporations): labour cost is a direct part of sector margin.
- [Output Quality](/wiki/output-quality): the wage level is the wages pillar.
- [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d): wages above baseline lift R&D efficiency.
- [Unions](/wiki/unions): pay below expectations pushes unionization and strikes.
- [National Metrics](/wiki/national-metrics): changes in the state wage index nudge median income, unemployment and migration.
- [Pensions](/wiki/pensions): The covered wage bill sets both the contribution and the accrual.

## Status

Wages, macro feedback, unions and union law are all live in current worlds. Labour shares are higher in older eras (see the era multiplier). Command economies have no private sectors, so only state-owned enterprise pay applies there.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Labour design page](https://docs.lakesidegames.net/design/labour.html).
`;
