export const demographicsContent = `# Demographics

Who lives in a state decides which policies win it. The demographics system models the voters in each state, and every vote in every election flows through voter groups and how well a candidate fits them, so it is the foundation under [Election Mechanics](/wiki/election-mechanics). It is a voter and election mechanic, not a corporation mechanic. For tactics (which group to spend on) see [Demographics & Targeting](/wiki/demographics-targeting).

## The census: who the electorate is

Each state's electorate is described by its census. In the US that is four dimensions:

| Dimension | Buckets |
| --- | --- |
| Race | White, Black, Hispanic, Asian, Other |
| Age | Young (18-29), Middle-Aged (30-49), Mature (50-64), Senior (65+) |
| Education | No college, College, Graduate |
| Wealth | Low, Middle, High |

Every state has its own real shares in each dimension: a rural state has more no-college voters, a coastal metro more graduates. Other countries use their own dimensions and buckets, mostly ethnicity, age, education, income and urbanization, because a bucket list that fits the US does not fit the UK or Japan.

Each bucket has an economic and a social position on the -5 to +5 scale, and a baseline turnout rate. Positions come from an era position table plus per-state overrides, so white voters in Texas sit to the right of white voters in Massachusetts. Regional texture comes out of the census, not one national table.

## Cells: how the census becomes voters

The dimensions are combined into **cells**, one combination across all of them, such as "white, mature, no college, middle income". The engine estimates how many voters sit in each cell by combining the state's own dimension shares with typical overlaps (no-college voters are more likely to be low income, graduate degrees predict high income) and drops cells too small to matter.

A cell's lean is the average of its buckets' positions, and its turnout is blended from its buckets' participation rates. Cells are what the vote engine counts, and turnout actions reach every cell that carries the bucket they target.

Every playable era has its own census bundles and position tables: a 1979 world has a 1979 electorate, not a reweighted 2019 one. Positions are authored per era and country to reflect that period's politics.

**A cell in a ten-million-voter state (illustrative).** In a state of 10,000,000 voters, the cell "white, mature, no college, middle income" is estimated at 6% of the electorate (600,000 people). Its buckets' turnout blends to 60%, so 360,000 of them vote. If its lean is +1.2 economic and +2.0 social, a candidate at (+1, +2) fits it almost perfectly, and a candidate at (-3, -2) is a total distance of 8.2 away and gets close to the floor of appeal there.

## How demographics drive elections

Each turn, the vote pool is split between cells by size and turnout. Inside a cell, candidates share the cell's votes by weights built from appeal x reach x approval x party organization x infamy (and, in generals, registration, support mood and coattails, followed by the persuasion swing between parties). The factors and their ranges are laid out in [Demographics & Targeting](/wiki/demographics-targeting), and the full vote model is in [Election Mechanics](/wiki/election-mechanics). The vote pool for [General Elections](/wiki/general-elections) is derived from the state's demographics, [Polling](/wiki/polling) reports your standing by voter group, and [granular polling](/wiki/granular-polling) builds each cell's size and turnout from census totals and era tables. A region's groups are also the cohorts in a [referendum](/wiki/referendums) campaign, and a state's [Government Approval](/wiki/government-approval) scales how many of its voters turn out.

## The numbers

| Item | Value |
| --- | --- |
| Position scale | -5 to +5 on both axes |
| Turnout modifier range | -20 to +20 percentage points |
| Modifier half-life (current races) | 6 turns (about 10.9% per turn) |
| Canvass | 1 action, ₳100, base 2.0 points x fit squared |
| Canvass fit floor | 0.2 (so 4% of base at worst) |
| Final 4 turns | canvass worth 2x |
| Party GOTV budget | 0 to 25% of hourly revenue |
| GOTV purchasing power | ₳5,000 of spend buys one full turnout point before alignment and diminishing returns |
| Maximum appeal | about 35.5 (25.5 from position, up to 10 from direction) |

## State political lean

A state's lean is its cells' economic and social leans, weighted by population share times turnout, averaged and clamped to -5..+5. Labels use the shared ruler rounded to the nearest step: 0 Centrist, plus or minus 1 Center-Left or Center-Right, plus or minus 2 Lean Left or Lean Right, plus or minus 3 Left or Right. US state leans built this way spread well under plus or minus 1, so most states label as Centrist; the map shades them on a continuous scale fitted to the actual spread instead of these labels. Elections use raw position differences, not the label.

## Moving turnout

Turnout modifiers sit on top of baseline turnout. They apply to a census bucket and reach every cell that carries it. There are two ways to move them:

- **Party GOTV spending** ([Political Parties](/wiki/political-parties)). A party budget targets one bucket and spends automatically each turn. A continuous alignment multiplier scales the boost by how close the party's position is to the bucket's lean, from 1.0 at perfect alignment down to a 0.1 floor. National spend splits evenly across states, while state spend applies in full to one state.
- **Player canvassing.** You canvass one bucket in your active campaign state. See [Canvassing](/wiki/canvassing); group size and turnout set what a boost is worth.

Diminishing returns apply to both: at a +10 modifier, a 1-point boost counts as 0.5. On current races modifiers decay with a 6-turn half-life (older races keep the legacy 2% per turn), so a boost needs sustained spending.

## Your platform against the cells

Candidates declare economic and social positions on the -5 to +5 scale. These are compared directly to each cell's leans in that state. A candidate at (-4, -4) appeals to young, graduate, urban voters and serves older no-college voters in conservative states poorly. A centrist (0, 0) has moderate appeal everywhere and strong appeal nowhere. Because leans are state-derived, the same platform lands differently from state to state, so poll locally. District maps in [US House Redistricting](/wiki/us-house-redistricting) take their squares from each state's party registration rather than from these cells, and active laws slowly shift group make-up and leanings (see [Policy Effects](/wiki/policy-effects)).

Why the system works this way: it makes geography matter without hard-coding a map, and it gives specialists a path to win by mobilizing their base while giving centrists a path by picking up the middle.

## What you can look at and change

- **Look at a state's makeup** on its region page (the census shares and the turnout by bucket). Where granular polls are switched on, the Full Demographic Poll breaks the electorate into segments and shows your share against each rival in each.
- **Choose policy positions** that fit the states you want to win.
- **Canvass** a bucket to raise its turnout.
- **Party chairs** can set GOTV budgets that raise a bucket's turnout automatically.

Tip: relying on intuition from another state misleads, because the same group can lean differently in two states.

Live in every world and country with elections. The four dimensions above are for the US. Other countries use their own groups, and every playable era has its own data. Last checked 2026-10-30, version 1.18.0. Exact rules: [Demographics (design)](https://docs.lakesidegames.net/design/demographics.html). See also [Campaign Strategy](/wiki/campaign-strategy).
`;
