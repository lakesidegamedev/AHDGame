export const corporateRAndDContent = `# Corporate R&D & Tech Trees

**Research and development (R&D)** lets a corporation turn money into permanent upgrades. You set a daily R&D budget, it builds an **R&D Score**, and you spend that score and cash to unlock nodes in a decade-gated **tech tree** on the corporation's **Tech** tab. The score also drives random innovation breakthroughs and is the biggest ingredient in [Output Quality](/wiki/output-quality).

## How it works

Every turn your R&D budget adds to your score and the score decays by 3%. Unlocking a node spends score immediately and takes cash. Nodes give lasting bonuses: more plant output, cheaper building, lower input and wage costs, protection from tariffs and dominance penalties, and new operating strategies.

### Key numbers

| Rule | Value |
| --- | --- |
| Starting R&D Score | 0 |
| Base gain with any budget | 1.2 per turn, plus 0.78 x ln(1 + budget / 100,000) |
| Decay | 3% of current score per turn |
| Diminishing returns | Gain falls as score rises; halved at score 100, and falls faster above it |
| Node score cost | Set by decade: 5 (1940s), 6, 8, 11, 13 (1979), 18, 24, 30, 38 (2019), 48 (2029) |
| Specialization cost | 2 times the decade cost; capstones 3 times |
| Node cash cost | Value of the node over one game year, or 5% of daily revenue for nodes with no running value |
| Overhead cap | R&D, marketing, logistics and CEO salary together cannot exceed 150% of daily revenue |
| Breakthrough roll | Every 6 turns, chance = score / 200 (capped at 100%) |
| Caps on node effects | Plant output 12%, input efficiency 30%, growth cost 50%, labour cost 50%, dominance shield 60% |
| Wage morale | Up to +15% R&D efficiency above baseline wages, up to -15% below |

### Worked example

You fund R&D at ₳100,000 per day. Each turn adds 1.2 + 0.78 x ln(2) = 1.74 before diminishing returns. Your score reaches about 23 after 20 turns and 37 after 60, and settles near **41**, where decay (3% of the score) cancels gain. A 2019-decade node costs 38 score, so at this budget you can afford about one node, then wait for the score to refill.

Raising the budget to ₳1,000,000 per day settles near **63**, enough for one node with a good buffer. The gain from the budget is logarithmic, so ten times the money buys about 50% more score. Spend on research until it is no longer the cheapest way to raise your [Output Quality](/wiki/output-quality), then switch to wages or operations.

## Tech trees overview

Every corporation has a **Tech** tab listing research nodes organized by **decade tier**. The world's current calendar year (derived from the active era preset plus elapsed game years) determines which decades are researchable: earlier decades are hidden, and future decades appear locked until the clock reaches them.

Each decade forks into two **lanes**:

| Lane | Scope | Contents |
| --- | --- | --- |
| **Corporate** | Shared across all sector types | Business functions: automation, analytics, marketing, logistics, etc. |
| **Sector** | Unique to your corporation's primary type | Specialist methods for energy, manufacturing, technology, extraction, and so on |

You **commit to one lane per decade** on first unlock. The other lane locks until you **abandon** that decade's progress (forfeiting lane-specific nodes).

Completing either lane opens a final **specialization tier** for that decade:

| Specialization | Focus |
| --- | --- |
| **Scale** | Lower input, wage, and expansion costs |
| **Premium** | Higher realized prices and stronger brand effects |
| **Resilience** | Protection from dominance penalties and tariffs, plus cheaper expansion |

You may complete exactly one specialization per decade. Choosing one locks the other two. Switching requires abandoning that decade and giving up its lane-specific and specialization progress. Specializations cost twice the decade's base research cost, and their capstones cost three times the base cost.

## Unlocking nodes

Each node has a dual cost:

- **R&D Score**: spent from the corporation's accumulated score (see below).
- **Cash**: priced by what the node is worth to your corporation. For nodes that save money or add profit on your running plants, the price is the estimated per-turn value times one game year, so every corporation waits about the same time for a node to pay for itself. Nodes with no running value (build discounts, shields, strength grants, production methods) cost 5% of daily gross revenue. A minimum cash price, scaled to the era, applies to every node so tiny corporations cannot unlock nodes for R&D score alone.

Additional gates:

- **Decade reached**: the world clock must have entered the node's decade.
- **Prerequisites**: earlier slots in the same lane must be owned.
- **Method unlocks**: some sector nodes unlock new operating strategies that stay locked until researched.

Unlocks are atomic: insufficient R&D or cash rejects the purchase, and lane commitment is enforced so you cannot buy both Corporate and Sector tracks in the same decade without abandoning first.

## Node effects

Tech nodes grant persistent bonuses, including:

- **Plant output** increases (more output from your plants, capped at 12% in total)
- **Marketing** or **logistics** strength grants
- **Growth cost** reductions
- Input-cost, wage, and output changes
- Protection from tariff and dominance penalties
- **Strategy unlocks**: gates advanced operating strategies behind research

Effects stack with normal sector modifiers and apply for the life of the corporation (until a reset removes the corp).

## R&D score and daily budget

Set a daily **R&D budget** from the CEO Budget tab. Each turn: new score = 97% of the old score + (1.2 + 0.78 x ln(1 + budget / 100,000)) x a diminishing factor of 100 / (100 + score + the part of the score above 100). With no budget, nothing is added.

| Property | Value |
| --- | --- |
| Starting score | 0 |
| Decay per turn | 3% of current score |
| Diminishing returns above | Score 100 |

Worker morale also nudges R&D efficiency: paying wages above baseline lifts it by up to 15%, and paying below baseline lowers it by up to 15%.

R&D spending counts toward the **150% overhead cap** alongside marketing, logistics, and CEO salary.

Tech-tree unlocks **spend down** the score immediately; the budget keeps refilling it for the next node.

## Innovation breakthroughs (legacy loop)

Every **6 turns**, the game rolls for a **breakthrough** independent of tech-tree purchases:

\`\`\`
probability = min(1, rdScore / 200)
\`\`\`

| R&D Score | Chance per 6-turn window |
| --- | --- |
| 100 | 50% |
| 200 | 100% |

On success, one random sector receives a **revenue boost** (2-10% for regular corps, 1-10% for extraction). Extraction corps also gain permanent **state resource capacity**. Breakthroughs notify the CEO in-game.

Tech trees and breakthroughs complement each other: trees give targeted permanent power, and breakthroughs add random sector growth on top.

## What the common effects do under the plants system

- **Capacity build cost** (growth cost reduction): discounts what you pay to build capacity, and shortens construction by 60% of the same percentage. A 20% discount means 12% faster builds. The total discount is capped at 50%.
- **Plant output**: raises every output rate of the sector's plants, which lifts both revenue and the supply you put on the market. This effect also replaces the old profit-margin and sale-price bonuses. Capped at 12% in total.
- **Market-dominance toll** (dominance shield): once you hold a dominant share, new capacity costs extra. The shield removes that percentage of the extra, permanently. It does nothing while you are below the dominance threshold. Capped at 60%.
- **Logistics strength**: eases the sprawl penalty above the sector threshold, and cuts your freight bill and the landed-price surcharge on inputs bought from other states, by up to 40% at a strength of 200.

## Strategic notes

- **Lane and specialization choices matter**: Corporate lane bonuses help every sector; Sector lane unlocks methods and margins specific to your industry; the final specialization decides whether that decade favors scale, premium output, or resilience.
- **Decade timing**: a 2019-start world only researches the final tiers; a 1979-start world walks the full tree over decades.
- **Cash + score planning**: nodes near the top of a decade cost more R&D and more cash; fund R&D before a unlock push.

## What you can do

- **Set the R&D budget** on the CEO Budget tab. It counts toward the 150% overhead cap.
- **Open the Tech tab** and pick a lane for each decade the world has reached. Switching lanes means abandoning that decade's progress.
- **Pick one specialization** per decade: Scale for costs, Premium for prices and brand, Resilience for shields and cheaper expansion.
- **Time your unlocks.** Nodes need score, cash, the right decade and the earlier nodes in the lane. Fund R&D before an unlock push, not after.
- **Pay fair wages.** Above-baseline wages lift R&D efficiency by up to 15% (see [Labour & Wages](/wiki/labour-and-wages)).

Corporate-lane effects apply to all your sectors at half strength. Sector-lane effects apply only to your primary sector type, at full strength.

### Common questions

- **Why was my node purchase rejected?** Check score, cash, decade and prerequisites. Unlocks are all-or-nothing.
- **What if I join late?** A world that starts in 2019 only offers the final decades; a 1979 start walks the whole tree.
- **Does R&D score ever run out?** It decays 3% a turn, so it falls if you stop funding it.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): the budget you set, the overhead cap, and your primary type decide what you can research.
- [Labour & Wages](/wiki/labour-and-wages): wages above or below baseline move R&D efficiency by up to 15%.

**Affects**

- [Output Quality](/wiki/output-quality): R&D Score is the tech pillar, 40% of quality.
- [Corporations](/wiki/corporations): nodes raise plant output, cut growth cost and unlock operating strategies.
- [Labour & Wages](/wiki/labour-and-wages): some nodes cut labour cost by up to 50%.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): logistics strength nodes cut your freight bill.

## Status

Tech trees run in every world with private corporations. Which decades you can research depends on the world's era and how many game years have passed: earlier decades are hidden and later ones locked. Command economies have no private corporations, so no tech tab.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

This system has no separate design page yet. The numbers above are the full set; the effect caps are in the table above, and the margin and strength rules are on [Corporations](/wiki/corporations).
`;
