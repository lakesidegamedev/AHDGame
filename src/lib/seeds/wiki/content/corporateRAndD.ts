export const corporateRAndDContent = `# Corporate R&D & Tech Trees

Research is the one place a corporation can turn money into permanent upgrades, and it is slow: you fund a daily budget, wait for a score to build, then spend that score and cash on a node. The payoff is lasting bonuses to plant output, building costs, input and wage costs, and protection from tariffs and dominance penalties. The score also drives random innovation breakthroughs and is the biggest ingredient in [Output Quality](/wiki/output-quality).

## Funding the score

Set a daily **R&D budget** from the CEO Budget tab. Each turn your budget adds to your score and the score decays by 3%. New score = 97% of the old score + (1.2 + 0.78 x ln(1 + budget / 100,000)) x a diminishing factor of 100 / (100 + score + the part of the score above 100). With no budget, nothing is added. R&D spending counts toward the **150% overhead cap** alongside marketing, logistics and CEO salary.

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

| Property | Value |
| --- | --- |
| Starting score | 0 |
| Decay per turn | 3% of current score |
| Diminishing returns above | Score 100 |

\`\`\`wiki-chart
rd-score-by-budget
\`\`\`

You fund R&D at ₳100,000 per day. Each turn adds 1.2 + 0.78 x ln(2) = 1.74 before diminishing returns. Your score reaches about 23 after 20 turns and 37 after 60, and settles near **41**, where decay (3% of the score) cancels gain. A 2019-decade node costs 38 score, so at this budget you can afford about one node, then wait for the score to refill.

Raising the budget to ₳1,000,000 per day settles near **63**, enough for one node with a good buffer. The gain from the budget is logarithmic, so ten times the money buys about 50% more score. Spend on research until it is no longer the cheapest way to raise your Output Quality, then switch to wages or operations.

Worker morale also nudges efficiency: paying wages above baseline lifts it by up to 15%, and paying below baseline lowers it by up to 15%. See [Labour & Wages](/wiki/labour-and-wages). The score runs down 3% a turn if you stop funding it.

## Reading the Tech tab

Every corporation has a **Tech** tab listing research nodes organized by **decade tier**. The world's current calendar year (derived from the active era preset plus elapsed game years) determines which decades are researchable: earlier decades are hidden, and future decades appear locked until the clock reaches them. A world that starts in 2019 only offers the final tiers; a 1979 start walks the full tree over decades.

Each decade forks into two **lanes**:

| Lane | Scope | Contents |
| --- | --- | --- |
| **Corporate** | Shared across all sector types | Business functions: automation, analytics, marketing, logistics, etc. |
| **Sector** | Unique to your corporation's primary type | Specialist methods for energy, manufacturing, technology, extraction, and so on |

You **commit to one lane per decade** on first unlock. The other lane locks until you **abandon** that decade's progress (forfeiting lane-specific nodes). Corporate-lane effects apply to all your sectors at half strength. Sector-lane effects apply only to your primary sector type, at full strength.

Completing either lane opens a final **specialization tier** for that decade:

| Specialization | Focus |
| --- | --- |
| **Scale** | Lower input, wage, and expansion costs |
| **Premium** | Higher realized prices and stronger brand effects |
| **Resilience** | Protection from dominance penalties and tariffs, plus cheaper expansion |

You may complete exactly one specialization per decade. Choosing one locks the other two. Switching requires abandoning that decade and giving up its lane-specific and specialization progress. Specializations cost twice the decade's base research cost, and their capstones cost three times the base cost. The final specialization decides whether that decade favors scale, premium output, or resilience.

## Buying a node

Each node has a dual cost:

- **R&D Score**: spent from the corporation's accumulated score.
- **Cash**: priced by what the node is worth to your corporation. For nodes that save money or add profit on your running plants, the price is the estimated per-turn value times one game year, so every corporation waits about the same time for a node to pay for itself. Nodes with no running value (build discounts, shields, strength grants, production methods) cost 5% of daily gross revenue. A minimum cash price, scaled to the era, applies to every node so tiny corporations cannot unlock nodes for R&D score alone.

Additional gates:

- **Decade reached**: the world clock must have entered the node's decade.
- **Prerequisites**: earlier slots in the same lane must be owned.
- **Method unlocks**: some sector nodes unlock new operating strategies that stay locked until researched.

Unlocks are atomic: insufficient R&D or cash rejects the purchase, and lane commitment is enforced so you cannot buy both Corporate and Sector tracks in the same decade without abandoning first. Unlocking spends the score immediately; the budget keeps refilling it for the next node. Nodes near the top of a decade cost more of both, so fund R&D before an unlock push, not after.

## What nodes do

Tech nodes grant persistent bonuses for the life of the [corporation](/wiki/corporations) (until a reset removes it), and they stack with normal sector modifiers:

- **Plant output** increases (more output from your plants, capped at 12% in total)
- **Marketing** or **logistics** strength grants
- **Growth cost** reductions
- Input-cost, wage, and output changes. Automation nodes can cut labour cost by up to 50% (see [Labour & Wages](/wiki/labour-and-wages))
- Protection from tariff and dominance penalties
- **Strategy unlocks**: gates advanced operating strategies behind research

Under the plants system, the common ones work like this:

- **Capacity build cost** (growth cost reduction): discounts what you pay to build capacity, and shortens construction by 60% of the same percentage. A 20% discount means 12% faster builds. The total discount is capped at 50%.
- **Plant output**: raises every output rate of the sector's plants, which lifts both revenue and the supply you put on the market. This effect also replaces the old profit-margin and sale-price bonuses. Capped at 12% in total.
- **Market-dominance toll** (dominance shield): once you hold a dominant share, new capacity costs extra. The shield removes that percentage of the extra, permanently. It does nothing while you are below the dominance threshold. Capped at 60%.
- **Logistics strength**: eases the sprawl penalty above the sector threshold, and cuts your freight bill and the landed-price surcharge on inputs bought from other states, by up to 40% at a strength of 200. See the [Logistics guide](/wiki/logistics-guide).

## Breakthroughs

Separately from the tree, every **6 turns** the game rolls for a **breakthrough**:

\`\`\`
probability = min(1, rdScore / 200)
\`\`\`

| R&D Score | Chance per 6-turn window |
| --- | --- |
| 100 | 50% |
| 200 | 100% |

On success, one random sector receives a **revenue boost** (2-10% for regular corps, 1-10% for extraction). Extraction corps also gain permanent **state resource capacity**. Breakthroughs notify the CEO in-game. Trees give targeted permanent power, and breakthroughs add random sector growth on top.

Applies in every world with private corporations; command economies have no private corporations, so no tech tab. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
