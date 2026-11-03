export const brOverviewContent = `# Brazil

Winning the presidency in Brazil does not mean you can pass a bill. The President is elected directly and serves a fixed 4 years, but the National Congress is split among many parties, so a President whose own party falls short of 257 Chamber seats has to bargain for every vote. Brazil is a **federal presidential republic**, South America's largest democracy, with a 2-term limit per character and chamber seats shared out by party vote share.

## A President facing Congress

The President is both head of state and head of government, **directly elected** by nationwide popular vote (no electoral college). From the 1991 preset on, a candidate needs a majority of the vote or the top two go to a runoff. Era rules differ: the 1953 preset elects by plurality for 5-year terms, and the 1979 preset picks the President indirectly for 6-year terms. There is no parliamentary confidence vote, and the President serves the full term regardless of congressional composition. **Divided government is the default**: one party holds the presidency while a rival coalition controls one or both chambers.

Bills require passage in both chambers, each by more ayes than nays, and then go to the President, who has 10 turns to sign or veto; a bill left alone is signed automatically. A veto opens a 2/3 override vote, but Brazil's bill cycle currently has no step that counts it, so in practice a veto stands. Both chambers have equal legislative weight, with no upper-chamber override asymmetry.

The **coalition threshold is 257 seats** (a bare majority of the 513-seat Chamber: 513 / 2 + 1; 153 of 304 in the 1953 preset). It does **not** determine who governs. It is the size of a dependable floor majority: a bloc that holds it can carry Chamber votes on its own. A President's party often falls short of 257, so even a unified presidential party may need allied blocs to pass legislation.

Say a bloc holds 150 Chamber seats. It needs 107 more, so it has to bring in allied parties with at least that many seats between them. The two major parties are **PT** (Workers' Party, centre-left) and **PL** (Liberal Party, centre-right), but smaller parties can hold the swing votes.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| Senator | Proportional (Hare largest remainder) macro-region election | Configured as 8 years; every seat is re-elected every 4 years | 81 |
| Federal Deputy | Proportional (Hare largest remainder) from 5 macro-regional constituencies | 4 years | 513 (304 in 1953) |
| Governor | FPTP macro-region election | 4 years | 1 per macro-region (5) |
| Governor of the BCB | Nominated by the President, then drawn | 4 years | 1 |

### The two-term limit and the running mate

A character cannot serve more than two terms as President. The limit is per-character, not per-party. It also reaches the running mate: a character who has already served two presidential terms cannot be picked as Vice President. See [Executive Term Limits](/wiki/executive-term-limits).

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

Federal Deputies (513, 4-year terms of 192 turns, 8 real days) are elected by **proportional representation** using the **Hare quota with largest remainders**. Each party sends one candidate per macro-region to the general election, and that candidate holds the party's whole block of the region's seats. The Chamber is the primary legislative body and the source of the coalition threshold.

- **All 513 seats are contested** each 4-year cycle.
- **A party needs at least 20% of the pooled vote in a macro-region** to win seats there. Parties under that line get none in that region.
- **Primaries advance one candidate** per party per region, as in other presidential countries.

Centro-Oeste elects 42 deputies. With 4,200,000 votes cast, one seat costs a quota of 100,000 votes. Party A has 2,100,000 votes (50%), B has 1,260,000 (30%) and C has 840,000 (20%). A gets 21 seats, B gets 12 and C gets 8, which is 41 of 42. The leftover votes are A 0, B 60,000 and C 40,000, so B takes the last seat. Final result: A 21, B 13, C 8.

For the shared primary and general rules see [Election Mechanics](/wiki/election-mechanics), and for fundraising, ads and canvassing see [Campaign Strategy](/wiki/campaign-strategy). [Multi-Country Play](/wiki/multi-country-play) compares PR with FPTP and covers cross-border investments.

## Winning a Senate seat

Senators are elected the same way as deputies: each macro-region elects its whole block of senators at once (Norte 21, Nordeste 27, Centro-Oeste 12, Sudeste 12, Sul 9), shared out by the Hare quota with largest remainders and the same 20% entry bar. The real Senate's staggered 8-year classes are not modeled yet, so every seat comes up every 4 years.

The Senate reviews legislation from the Chamber and can reject bills. Both chambers participate in the player legislative loop. The Senate cannot be dissolved, and neither can the Chamber: the President cannot dissolve Congress, there are no snap elections and no-confidence votes do not exist.

## Climbing the ladder

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Federal Deputy | +1 action/turn; national legislature access from the start |
| Parallel | Senator | +2 actions/turn; re-elected every 4 years |
| Mid-game | Governor | +2 actions/turn; controls state executive; 4-year term |
| Top | President | +4 actions/turn; heads state and government; 2-term cap |

Brazil has no sub-national legislature. The first rung is a Federal Deputy seat, contested in your home macro-region. See [Player Progression](/wiki/player-progression).

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. A ratified charter seeds 3 founding NPPs (non-player politicians run by the game): one in the lead founder's home region and two in regions the founders pick.

The social axis runs from libertarian (−5) to authoritarian (+5). Brazil starts at the center (baseline 0) and drifts toward the social stance of enacted national laws over time.

## Four starting economies

Brazil appears in every preset, with **four authored metric baselines**: 1953, 1979, 1991, and 2019 (the default). Each authors its own national baseline and per-region tilts for Brazil's tracked economic, education, healthcare, infrastructure, and social metrics, so the starting economy looks materially different depending on which era you launch into:

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
| Currency | BRL (shown as Cr$ in 1953 and BRL eq. in 1979 and 1991) |
| Central Bank | Banco Central do Brasil (BCB) |
| Chair title | Governor of the BCB |
| Default prime rate | 8.0% (5.0% opening rate in the 1991 preset) |
| Stock exchange | B3 |
| Finance Minister | Minister of Finance |

## Living history

The timeline below is written by the turn processor whenever a national event happens in-game: a change of leader, a national law enacted, an alliance joined or left, or a region transferred. Each entry is a real event from this save.

\`\`\`country-history
BR
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Brazil runs as an economy preview in every preset: its economy is simulated, but its offices are closed to players. Authored 1953, 1979, 1991 and 2019 economies. Last checked 2026-10-30, version 1.18.0.
`;
