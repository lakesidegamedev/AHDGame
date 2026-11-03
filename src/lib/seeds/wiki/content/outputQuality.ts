export const outputQualityContent = `# Output quality

Two corporations make the same goods. One has deep research and decent pay; the other skimps on both. Their quality scores differ, and so does everything built downstream from them. **Output quality** is a score from 0 to 100 for how good your goods are, built every turn from four things you already manage: research, the quality of your inputs, wages and operations.

## The four pillars

Every sector gets a quality score every turn, except extraction-only sectors (those whose only outputs are oil, coal, iron, natural gas, timber or rare earth). Each pillar is turned into a sub-score between 0.1 and 1, and the four are blended as a weighted geometric mean (a product where each term is raised to its weight, so a weak pillar drags the result down more than a strong one lifts it).

| Pillar | Weight | Sub-score | Reaches 1.0 at |
| --- | --- | --- | --- |
| Tech | 0.4 | square root of (R&D score / 25) | R&D score 25 |
| Inputs | 0.2 | average input quality / 100 (50 if none of the sector's inputs carry a quality score, as with raw ore and fuel) | input quality 100 |
| Wages | 0.2 | 0.5 + 0.6 x (wage level - 1) | wage level 1.83 (above the 1.5 maximum, so wages alone never max out) |
| Operations | 0.2 | square root of (Logistics & Operations strength / 15) | strength 15 |

\`\`\`wiki-chart
output-quality-pillars
\`\`\`

Pillars **substitute, they do not gate**. Poor inputs pull quality down, but strong tech, wages or operations pull it back up. No pillar can drop a sub-score below 0.1, so one terrible pillar never zeroes the product.

Tech has the largest weight, so research is the strongest single driver. Your R&D score grows with your R&D budget and decays 3% a turn, and unlocking a node in the [Corporate R&D tech tree](/wiki/corporate-r-and-d) spends it, so a big unlock lowers your tech pillar until the score rebuilds. The wages pillar follows each sector's wage level, which runs from 0.8 to 1.5 (see [Labour & Wages](/wiki/labour-and-wages)). Operations strength is covered in the [Logistics guide](/wiki/logistics-guide).

## Why B can catch A

Corporation A has an R&D score of 25, Logistics & Operations strength of 15, wage level 1.0 and input quality 50. Tech and operations are 1.0; wages and inputs are 0.5. Quality is 100 x 1 x 0.5^0.2 x 0.5^0.2 x 1 = **75.8**.

Corporation B has an R&D score of 6.25, strength 15, wage level 1.5 and input quality 80. Tech is 0.5, wages 0.8, inputs 0.8, operations 1.0. Quality is 100 x 0.5^0.4 x 0.8^0.2 x 0.8^0.2 = **69.3**.

B is behind on research but closes most of the gap with pay and better inputs. If B drops its wage level back to 1.0 and its inputs to 50, it falls to **57.4**. Lifting only the wage level from 1.0 to 1.5 on that version gives **63.1**, a gain of 5.7 points for the whole pay rise. So going from 1.0 to 1.5 lifts the wage pillar from 0.5 to 0.8, about 10% on the quality score by itself, and it also costs real money every turn. Weigh it against research.

Because the blend is geometric, lifting your weakest pillar is worth more than topping up your strongest. That is also why a good R&D score can still leave quality low: tech is only 40%, baseline wages (level 1.0) cap the wage pillar at 0.5, and operations strength under 15 holds that pillar below 1.0.

## Quality travels down the chain

A sector's input pillar uses the average quality of the [commodities](/wiki/commodities) it consumes, as made by all corporate producers of that commodity in the world last turn, weighted by their revenue. Last turn's output feeds this turn's input, so a change in your tech or wages shows up in your own score straight away, and reaches the sectors that buy from you one turn later.

Note this is a market-wide average per commodity, not the quality of one supplier. A [supply agreement](/wiki/supply-agreements) with a good supplier does not by itself raise your input quality, although the supplier's output counts toward the commodity average.

![Raw extraction has no quality score; manufacturers and consumer goods sectors take the average commodity quality into their inputs pillar.](/wiki-images/diagrams/output-quality-supply-chain.svg)

Mines and wells produce ore and crude that are interchangeable, so extraction-only sectors carry no quality score and are left out of the corporation average. Their edge is reliable delivery, which is what [brand loyalty](/wiki/brand-loyalty) measures.

## Where you see it, and what it does

Every corporation shows **Average Quality** on its page, a revenue-weighted average across non-extraction sectors, and the Charts tab plots it over time next to share price and market cap. The page itself is the [corporation](/wiki/corporations) page.

Quality does not decide who buys from you; in clearing, price, contracts and loyalty do. It does change what a premium earns. When you post a price above the market reference, your corporation's Average Quality from last turn scales the premium part of that price: neutral at 50, up to 1.3 times the premium at 100 and down to 0.7 times at 0. A discount or a market price is never scaled. Products with their own quality score, such as media titles, use that score instead.

Applies in worlds where the output quality system is on, which includes new worlds; where it is off, no Average Quality appears. Extraction-only sectors never have a score. Last checked 2026-10-30, version 1.18.0. This system has no separate design page yet.
`;
