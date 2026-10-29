export const brOverviewContent = `# Brazil

Winning the presidency in Brazil does not mean you can pass a bill. The President is elected directly and serves a fixed 4 years, but the National Congress is split among many parties, so a President whose own party falls short of 257 Chamber seats has to bargain for every vote. Brazil is a **federal presidential republic**, South America's largest democracy, with a 2-term limit per character and chamber seats shared out by party vote share.

## A President facing Congress

The President is both head of state and head of government, **directly elected** by nationwide popular vote (no electoral college). There is no parliamentary confidence vote, and the President serves the full 4-year term regardless of congressional composition. **Divided government is the default**: one party holds the presidency while a rival coalition controls one or both chambers.

Bills require passage in both chambers and presidential signature. The President can veto legislation; Congress can override with a 2/3 supermajority. Both chambers have equal legislative weight, with no upper-chamber override asymmetry.

The **coalition threshold is 257 seats** (a bare majority of the 513-seat Chamber: 513 / 2 + 1). It does **not** determine who governs. It matters for **legislative agenda control**: which party chairs committees, drives floor votes, and can override a presidential veto. A President's party often falls short of 257, so even a unified presidential party may need allied blocs to pass legislation.

Say a bloc holds 150 Chamber seats. It needs 107 more, so it has to bring in allied parties with at least that many seats between them. The two major parties are **PT** (Workers' Party, centre-left) and **PL** (Liberal Party, centre-right), but smaller parties can hold the swing votes.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| Senator | FPTP macro-region election (staggered) | 8 years (staggered) | 81 |
| Federal Deputy | Proportional (Hare largest remainder) from 5 macro-regional constituencies | 4 years | 513 |
| Governor | FPTP macro-region election | 4 years | 1 per macro-region (5) |
| Governor of the BCB | Appointed action | 4 years | 1 |

### The two-term limit and the running mate

A character cannot serve more than two terms as President. The limit is per-character, not per-party. A second-term run locks the VP running mate: the incumbent VP is locked onto the ticket and cannot be swapped, so a President who wants a different running mate has to choose before the first term ends. See [Executive Term Limits](/wiki/executive-term-limits).

## Seats by macro-region

The game models Brazil as five macro-regional states (Norte, Nordeste, Centro-Oeste, Sudeste, Sul), each electing a block of deputies sized by population. The Senate has 81 senators (three for each of Brazil's 27 states), grouped into the five macro-regions.

| Macro-region | Chamber seats | Senate seats |
| --- | --- | --- |
| Norte | 75 | 21 |
| Nordeste | 144 | 27 |
| Centro-Oeste | 42 | 12 |
| Sudeste | 179 | 12 |
| Sul | 73 | 9 |
| **Total** | **513** | **81** |

\`\`\`wiki-chart
br-seats-by-region
\`\`\`

## Winning a Chamber seat

Brazil uses **two different electoral systems** for its two chambers. Federal Deputies (513, 4-year terms of 192 turns, 8 real days) are elected by **proportional representation** using the **Hare quota with largest remainders**. Votes for a party's candidates are pooled, and the region's seats are shared out by that vote share. Within a party, seats go to its candidates in order of their own votes. The Chamber is the primary legislative body and the source of the coalition threshold.

- **All 513 seats are contested** each 4-year cycle.
- **A party needs at least 20% of the pooled vote in a macro-region** to win seats there. Parties under that line get none in that region.
- **Primaries advance the top 3 candidates** per party per region.

Centro-Oeste elects 42 deputies. With 4,200,000 votes cast, one seat costs a quota of 100,000 votes. Party A has 2,100,000 votes (50%), B has 1,260,000 (30%) and C has 840,000 (20%). A gets 21 seats, B gets 12 and C gets 8, which is 41 of 42. The leftover votes are A 0, B 60,000 and C 40,000, so B takes the last seat. Final result: A 21, B 13, C 8.

For the shared primary and general rules see [Election Mechanics](/wiki/election-mechanics), and for fundraising, ads and canvassing see [Campaign Strategy](/wiki/campaign-strategy). [Multi-Country Play](/wiki/multi-country-play) compares PR with FPTP and covers cross-border investments.

## Winning a Senate seat

Senators are elected by **First Past the Post (FPTP)** from statewide constituencies: each state's block of senators splits across two alternating 8-year classes, so only part of the chamber is up in any cycle. Seats alternate between 2 classes each cycle, and each contested seat is a single-member constituency. Plan your Senate run for the correct class in your home macro-region.

The Senate reviews legislation from the Chamber and can amend or reject bills. Both chambers participate in the player legislative loop. The Senate cannot be dissolved, and neither can the Chamber: the President cannot dissolve Congress, there are no snap elections and no-confidence votes do not exist.

## Climbing the ladder

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Federal Deputy | +1 action/turn; national legislature access from the start |
| Parallel | Senator | +2 actions/turn; 8-year terms; staggered classes |
| Mid-game | Governor | +2 actions/turn; controls state executive; 4-year term |
| Top | President | +4 actions/turn; heads state and government; 2-term cap |

Brazil has no sub-national legislature. The first rung is a Federal Deputy seat, contested in your home macro-region. See [Player Progression](/wiki/player-progression).

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. Brazil needs 3 regions plus your locked home region, so 4 regions, and 2 NPPs (non-player parties, the game's computer-run parties) spawn in each: 8 NPPs in total.

The social axis runs from socially liberal (−5) to socially conservative (+5). Brazil starts at the center (baseline 0) and drifts toward the social stance of enacted national laws over time.

## Four starting economies

Brazil has **four seeded start years**: 1953, 1979, 1991, and 2019 (the default). Each start authors its own national baseline and per-region tilts for the full set of Brazil's tracked economic, education, healthcare, infrastructure, and social metrics, so the starting economy looks materially different depending on which era you launch into:

\`\`\`wiki-chart
br-monetary-targets-by-era
\`\`\`

| Era | Character |
| --- | --- |
| 1953 | Post-war import-substitution economy, early industrialization |
| 1979 | Late military-regime "miracle" hangover: high inflation, second oil shock pressure |
| 1991 | Pre-Real-Plan hyperinflation years (Collor-era recession and asset freeze), a young post-dictatorship democracy with a still-closed economy |
| 2019 | Modern Brazil: a resource-extraction-driven emerging market (commodity exports like soybeans, iron ore, oil, and meat dominate) |

A 1953 or 1979 start begins earlier in Brazil's industrialization arc; a 1991 start begins in hyperinflation and opens up over time through play; a 2019 start begins as a resource-extraction economy already integrated into modern global trade.

Brazil's monetary baseline also shifts by era. The game tracks a **target inflation** rate and a **neutral prime rate** (the interest rate that neither speeds up nor slows down the economy). The central bank's rate rule reacts to the gap between actual and target inflation.

| Era | Target inflation | Neutral prime rate |
| --- | --- | --- |
| Modern (2019 and later) | 4% | 8% |
| 1953 | 4% | 8% |
| 1979 | 12% | 15% |
| 1991 | 12% | 15% |

The 1953 anchor matches the modern one because 1953 Brazil is authored as running policy-target inflation rather than the historical price spike. The 1979 and 1991 anchors are high, which is why inflation starts high in those worlds. These anchors set what the central bank treats as "on target". They are not fixed rates: actual inflation and the prime rate still respond to real conditions each turn.

| Item | Detail |
| --- | --- |
| Currency | BRL |
| Central Bank | Banco Central do Brasil (BCB) |
| Chair title | Governor of the BCB |
| Default prime rate | 8.0% |
| Stock exchange | B3 |
| Finance Minister | Minister of Finance |

## Living history

The timeline below is written by the turn processor whenever a presidential transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
BR
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Playable in every era, with authored 1953, 1979, 1991 and 2019 economies. Last checked 2026-10-29, version 1.18.0.
`;
