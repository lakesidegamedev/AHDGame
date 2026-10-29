export const outputQualityContent = `# Output quality

**Output quality** is a score from 0 to 100 for how good the goods your corporation makes are. It is built every turn from four things you already manage: research, the quality of your inputs, wages and operations. It matters because quality passes down the supply chain: better goods from you raise the quality of everything built from them.

## How it works

Each manufacturing or service sector gets a quality score every turn from four **pillars**. Each pillar is turned into a sub-score between 0.1 and 1, and the four are blended as a weighted geometric mean (a product where each term is raised to its weight, so a weak pillar drags the result down more than a strong one lifts it).

| Pillar | Weight | Sub-score | Reaches 1.0 at |
| --- | --- | --- | --- |
| Tech | 0.4 | square root of (R&D score / 25) | R&D score 25 |
| Inputs | 0.2 | average input quality / 100 (50 if the sector has no measurable inputs) | input quality 100 |
| Wages | 0.2 | 0.5 + 0.6 x (wage level - 1) | wage level 1.83 (above the 1.5 maximum, so wages alone never max out) |
| Operations | 0.2 | square root of (Logistics & Operations strength / 15) | strength 15 |

Pillars **substitute, they do not gate**. Poor inputs pull quality down, but strong tech, wages or operations pull it back up. No pillar can drop a sub-score below 0.1, so one terrible pillar never zeroes the product. Tech has the largest weight, so research is the strongest single driver.

### Worked example

Corporation A has an R&D score of 25, Logistics & Operations strength of 15, wage level 1.0 and input quality 50. Tech and operations are 1.0; wages and inputs are 0.5. Quality is 100 x 1 x 0.5^0.2 x 0.5^0.2 x 1 = **75.8**.

Corporation B has an R&D score of 6.25, strength 15, wage level 1.5 and input quality 80. Tech is 0.5, wages 0.8, inputs 0.8, operations 1.0. Quality is 100 x 0.5^0.4 x 0.8^0.2 x 0.8^0.2 = **69.3**.

B is behind on research but closes most of the gap with pay and better inputs. If B drops its wage level back to 1.0 and its inputs to 50, it falls to **57.4**. Lifting only the wage level from 1.0 to 1.5 on that version gives **63.1**, a gain of 5.7 points for the whole pay rise.

### Quality moves up the supply chain

A sector's input pillar uses the average quality of the commodities it consumes, as made by all producers of that commodity in the world last turn. Last turn's output feeds this turn's input, so a change in your tech or wages shows up in your own score straight away, and reaches the sectors that buy from you one turn later.

Note this is a market-wide average per commodity, not the quality of one supplier. A [supply agreement](/wiki/supply-agreements) with a good supplier does not by itself raise your input quality, although the supplier's output counts toward the commodity average.

### Raw extraction has no quality

Mines and wells produce ore and crude that are interchangeable, so extraction-only sectors carry no quality score and are left out of the corporation average. Their edge is reliable delivery, which is what [brand loyalty](/wiki/brand-loyalty) measures.

### What the number is for

Quality is a measure and a chain input. In ordinary commodity clearing it does not decide who buys from you; price, contracts and loyalty do. Where a world prices premium goods on quality (media and advertised products), a higher score supports a higher price.

## What you can do

- **Raise the cheapest pillar.** Because the blend is geometric, lifting your weakest pillar is worth more than topping up your strongest.
- **Invest in research.** Tech carries 40% of the weight. Unlock nodes in the [Corporate R&D tech tree](/wiki/corporate-r-and-d).
- **Use the wage slider.** Each sector's wage level runs from 0.8 to 1.5 (see [Labour & Wages](/wiki/labour-and-wages)). Going from 1.0 to 1.5 lifts that pillar from 0.5 to 0.8, about 10% on the quality score by itself.
- **Strengthen operations.** Logistics & Operations strength is covered in the [Logistics guide](/wiki/logistics-guide).
- **Watch the line.** Every corporation shows **Average Quality** on its page, a revenue-weighted average across non-extraction sectors, and the Charts tab plots it over time next to share price and market cap.

### Common questions

- **Why is my quality low with good R&D?** Tech is only 40%. Baseline wages (level 1.0) cap the wage pillar at 0.5, and an operations strength under 15 holds that pillar below 1.0.
- **Is paying more worth it?** It lifts quality by up to about 10% per sector at the 1.5 maximum, and also costs real money every turn. Weigh it against research.
- **How fast does it change?** Scores are recomputed every turn, so a change in your own pillars shows immediately. Input quality moves one turn behind.

## Connections

**Driven by**

- [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d): your R&D score sets the tech pillar, the heaviest.
- [Labour & Wages](/wiki/labour-and-wages): the sector wage level sets the wages pillar.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): Logistics & Operations strength sets the operations pillar.
- [Commodities](/wiki/commodities): the average quality of what you consume sets the inputs pillar.

**Affects**

- [Commodities](/wiki/commodities): your output joins the commodity's average quality that downstream sectors consume.
- [Corporations](/wiki/corporations): Average Quality is shown on the corporation page and chart.

## Status

Quality is computed in worlds where the output quality system is on, which includes new worlds. Where it is off, no Average Quality appears. Extraction-only sectors never have a score.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

This system has no separate design page yet. Every constant it uses is in the pillar table above, and how quality feeds the supply chain is described on [Commodities](/wiki/commodities).
`;
