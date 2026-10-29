export const corporateRAndDContent = `# Corporate R&D & Tech Trees

Corporations invest in research through two linked systems: a **Tech tab** with decade-gated **tech trees**, and a background **R&D Score** that still drives periodic innovation breakthroughs. Both spend from the same daily R&D budget and share the overhead cap.

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
- **Cash**: priced by what the node is worth to your corporation. For nodes that save money or add profit on your running plants, the price is the estimated per-turn value times one game year, so every corporation waits about the same time for a node to pay for itself. Nodes with no running value (build discounts, shields, strength grants, production methods) cost 5% of daily gross revenue. A minimum cash price, scaled to the era, applies to every node so tiny corporations cannot unlock nodes for R&D score alone (\`src/lib/constants/techTree/costs.ts\`).

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

Set a daily **R&D budget** from the CEO Budget tab. Each turn:

\`\`\`
baseGain = 1.2 (if any R&D budget is set)
scaledGain = 0.78 × ln(1 + budget / 100,000)
diminishing = 100 / (100 + score + max(0, score − 100))
decay = 3% of current score
newScore = max(0, (1 − 0.03) × oldScore + (baseGain + scaledGain) × diminishing(oldScore))
\`\`\`

| Property | Value |
| --- | --- |
| Starting score | 0 |
| Decay per turn | 3% of current score |
| Diminishing returns above | Score 100 |

Worker morale also nudges R&D efficiency: paying wages above baseline lifts it by up to 15%, and paying below baseline lowers it by up to 15% (\`src/lib/constants/corporations.ts\`).

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
- **Plant output**: raises every output rate of the sector's plants, which lifts both revenue and the supply you put on the market. This effect also replaces the old profit-margin and sale-price bonuses. Capped at 12% in total (\`src/lib/constants/techTree/effects.ts\`).
- **Market-dominance toll** (dominance shield): once you hold a dominant share, new capacity costs extra. The shield removes that percentage of the extra, permanently. It does nothing while you are below the dominance threshold. Capped at 60%.
- **Logistics strength**: eases the sprawl penalty above the sector threshold, and cuts your freight bill and the landed-price surcharge on inputs bought from other states, by up to 40% at a strength of 200.

## Strategic notes

- **Lane and specialization choices matter**: Corporate lane bonuses help every sector; Sector lane unlocks methods and margins specific to your industry; the final specialization decides whether that decade favors scale, premium output, or resilience.
- **Decade timing**: a 2019-start world only researches the final tiers; a 1979-start world walks the full tree over decades.
- **Cash + score planning**: nodes near the top of a decade cost more R&D and more cash; fund R&D before a unlock push.

## Related

- [Corporations](/wiki/corporations): CEO tools, operating strategies, overhead cap
- [Commodities](/wiki/commodities): Price realization and margin modifiers
- [Corporate Bonds](/wiki/corporate-bonds): Financing R&D-heavy expansion
`;
