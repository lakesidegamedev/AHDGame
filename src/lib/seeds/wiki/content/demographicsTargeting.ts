export const demographicsTargetingContent = `# Demographics & Targeting

Your favorability might be 70 overall and still be 58 with no-college voters in Pennsylvania, and that gap can be what is losing you the race. Every state has its own demographic profile that decides who votes, how many of them show up, and where they sit on the economic and social axes. Targeting is choosing which groups to spend on. For vote-accumulation math see [Election Mechanics](/wiki/election-mechanics), for turnout see [Canvassing](/wiki/canvassing), and for how the census is built see [Demographics](/wiki/demographics), whose cells, sizes and leanings are the raw material here.

## How the vote engine sees a state

A US state's voters are described by four dimensions, and every voter sits in one bucket of each:

| Dimension | Buckets |
| --- | --- |
| Race | White, Black, Hispanic, Asian, Other |
| Age | Young (18-29), Middle-Aged (30-49), Mature (50-64), Senior (65+) |
| Education | No college, College, Graduate |
| Wealth | Low, Middle, High |

The engine combines them into **cells** (for example "Black, middle-aged, college, middle income"). A cell's size is estimated from the state's own shares, its lean is the average of its buckets' positions, and its turnout is blended from their participation rates. Cells are what the vote engine counts.

Leans are **state-derived**. Each state carries its own position overrides on top of the era's base table, so white voters in a deep-red state sit further right than white voters in a blue coastal state. Never assume a national table: poll the state ([Polling](/wiki/polling) gives you the group-by-group numbers, and [granular polling](/wiki/granular-polling) shows which segments to aim ads and visits at).

### What decides your share of a cell

For each cell each turn, the pool is split between candidates in proportion to appeal x reach x approval x party organization x infamy.

| Factor | Range | What it measures |
| --- | --- | --- |
| Reach | 0.1 to 1.0 | Square root of political influence, 1.0 at influence 100. Never below 0.1 |
| Appeal | about 0.5 to 35.5 | How close your positions are to the cell's, plus a direction bonus of up to 5 per axis. Influence does not enter appeal |
| Approval | 0 to 1 | (Favorability / 100) to the power 0.8 |
| Party organization | 0 to 1.0 | Your party's share of the state's organization, to the power 0.2 |
| Infamy | 0.95 to 1.0 | 1 - 0.05 x infamy / 100 (1.0 for NPPs) |

The party strength modifier then scales the whole turn pool: for state races (1 + (state approval / 100 - 0.5) x 0.2) times office strength, and for presidential state results the approval swing is x0.5 instead of x0.2.

![A cell's pool is split between candidates in proportion to the product of reach, appeal, approval, party organization and infamy.](/wiki-images/diagrams/demographics-targeting-vote-pipeline.svg)

### Appeal falls off with distance

Appeal is 25 x ((50 - 5 x econ gap - 5 x social gap) / 50) to the power 1.5, plus 0.5, with a direction bonus on top. Total distance means the econ gap plus the social gap:

| Total distance | 0 | 1 | 2 | 3 | 4 | 6 | 8 | 10 or more |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Appeal (before direction bonus) | 25.5 | 21.8 | 18.4 | 15.1 | 12.1 | 6.8 | 2.7 | 0.5 |

\`\`\`wiki-chart
appeal-policy-distance
\`\`\`

The curve is deliberately softer than squaring so that campaigning, favorability and organization still move outcomes, and ideology alone does not dominate every race. Each voter group's own centre on the grid decides what a position earns; see [Party Ideology](/wiki/party-ideology). A centrist (0, 0) is a moderate distance from every cell. A far-left candidate (-5, -5) is nearly on top of the most progressive cells and far from the most conservative. Specialists beat generalists inside their base. Generalists beat specialists across the whole field.

### Ads or canvassing?

A cell is worth its size times its turnout. A group that is 22% of the electorate at 40% turnout is worth 8.8. A group that is 15% at 70% is worth 10.5, so the smaller group is the bigger prize. Raising favorability from 50 to 60 with a group lifts your approval factor from 0.574 to 0.665, which is 16% more of your weight there. A single ad gain of +3 (50 to 53) is about +4.8%. By comparison, canvassing a group where you already have approval 80 and turnout is only 38% adds up to 2 points of turnout per action. If you already own a group, canvass it. If you are 50-50 with it, advertise to it.

### Turnout

Each group has a baseline turnout rate. Party GOTV and suppression budgets ([Party Actions](/wiki/party-actions)) move it for the groups they target, and so can you:

- **Canvassing** (see [Canvassing](/wiki/canvassing)): 1 action and ₳100, per group, doubled in the final 4 turns.
- **Decay:** on current races modifiers halve every 6 turns toward zero. Older races still on the legacy rules decay 2% per turn.
- **Cap:** plus or minus 20 percentage points.

A modifier applies to the bucket you target and reaches every cell that carries it. Boosting Young raises turnout in every young cell, whatever its race, education or wealth.

### State political lean

A state's lean is the turnout-weighted average of all its cells. Labels use the shared -5 to +5 ruler: 0 Centrist, plus or minus 1 Center-Left or Center-Right, plus or minus 2 Lean, plus or minus 3 Left or Right. Lean helps lean-aligned candidates in presidential races through the per-state lean modifier, and it decides which parties field candidates in some states.

### The numbers

| Item | Value |
| --- | --- |
| Full Demographic Poll | 6 actions, ₳75,000 base |
| Quick Poll | 2 actions, ₳25,000 base |
| Targeted ads | 1 action, ₳100 each, up to 25 points of bonus |
| Canvass | 1 action, ₳100, up to +20 turnout |
| Position scale | -5 to +5 on each axis |
| Approval exponent | 0.8 |
| Party organization exponent | 0.2 |

## Working through a race

1. **Poll first.** Run a Full Demographic Poll at the start of every general you plan to win. It shows your vote share, appeal and approval group by group.
2. **Sort the groups.** Locks are groups where you lead by a wide margin. Contested groups are within about 10 points. Lost groups are far behind and not worth chasing.
3. **Spend on the contested groups, maintain the locks, ignore the lost ones** unless they are huge.
4. **Match the tool to the group:** ads ([Fundraising and Ads](/wiki/fundraising-ads), about ₳100,000, 5 or more actions, lift favorability) where you are close to 50% approval. Canvassing where you already lead but turnout is low.
5. **Re-poll** after a canvassing burst or an opponent's ad spike. Targeting decides where limited actions and funds go in your wider plan; see [Campaign Strategy](/wiki/campaign-strategy).

Tips:

- A 1-point favorability bump on a 15% group is worth more than a 5-point bump on a 2% group.
- Canvassing a group where your appeal is high turns turnout directly into votes. Canvassing one at appeal 5 is near-worthless.
- Groups at appeal 12 to 20 are recoverable with ads. At appeal 5 and under, skip them mid-cycle.

Which group first? The one where size x turnout is largest and your gap to the leader is smallest. Why is my appeal low with a group? Because the group sits more than 4 points away from you in total distance on the two axes. That is a positions problem, and only a policy change fixes it.

### Other countries

The four-dimension model is US-specific. Other countries use their own census dimensions with their own buckets:

| Country family | Dimensions |
| --- | --- |
| Most non-US models | ethnicity, age, education, income, urbanization |
| UK | Education runs from no qualifications to degree-plus |
| Germany | Education runs from no degree to Hochschulabschluss |
| Japan, Brazil | Own education ladders (Japan five levels, Brazil three) |

The math is the same. Each country's leans are calibrated per era against real election results. See the country hubs.

Live in every world and country with elections. The four-dimension buckets above are US; other countries use their own groups. Last checked 2026-10-29, version 1.18.0. Exact rules: [Demographics targeting (design)](https://docs.lakesidegames.net/design/demographics-targeting.html)
`;
