export const brOverviewContent = `# Brazil

Brazil is a **federal presidential republic**: South America's largest democracy, with a directly elected President, a bicameral National Congress, and a fragmented multi-party system. The President serves a fixed 4-year term with a 2-term limit per character. Chamber seats are shared out by party vote share, so coalition-building is essential for passing bills despite the presidential system.

---

## Government structure

| Office | How Filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| Senator | FPTP macro-region election (staggered) | 8 years (staggered) | 81 |
| Federal Deputy | Proportional (Hare largest remainder) from 5 macro-regional constituencies | 4 years | 513 |
| Governor | FPTP macro-region election | 4 years | 1 per macro-region (5) |
| Governor of the BCB | Appointed action | 4 years | 1 |

The **President** is both head of state and head of government: directly elected for a fixed 4-year term. There is no parliamentary confidence vote. A 2-term limit per character applies, and a second-term run blocks running-mate selection (the VP cannot be changed on a re-election bid).

The **National Congress** is bicameral and **both chambers participate in the player legislative loop**: bills require passage in both the Chamber of Deputies and the Federal Senate.

---

## National congress

Brazil's legislature has two chambers:

- **Chamber of Deputies**: 513 Federal Deputies elected by **proportional representation** from 5 multi-member constituencies: the game models Brazil as five macro-regional states (Norte, Nordeste, Centro-Oeste, Sudeste, Sul), each electing a block of deputies sized by population. 4-year terms (192 turns, 8 real days). **All seats are contested** each cycle. The Chamber is the primary legislative body and the source of the coalition threshold.
- **Federal Senate**: 81 senators (three for each of Brazil's 27 states), grouped into the five macro-regions and serving **8-year staggered terms**. Seats alternate between 2 classes each cycle. The Senate reviews legislation from the Chamber and can amend or reject bills.

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

---

## Coalition threshold

The **coalition threshold is 257 seats** (a bare majority of the 513-seat Chamber of Deputies: 513 / 2 + 1). A party or coalition holding 257+ seats controls the Chamber.

Unlike parliamentary systems, the threshold does **not** determine who governs: the President is directly elected and serves a fixed term regardless of legislative composition. Instead, the 257-seat threshold matters for **legislative agenda control**: which party chairs committees, drives floor votes, and can override a presidential veto (a 2/3 supermajority in both chambers).

**Worked example.** Say a bloc holds 150 Chamber seats. It needs 107 more, so it has to bring in allied parties with at least that many seats between them. The two major parties are **PT** (Workers' Party, centre-left) and **PL** (Liberal Party, centre-right), but smaller parties can hold the swing votes.

---

## How Brazilian elections work

Brazil uses **two different electoral systems** for its two chambers:

### Chamber of Deputies: proportional (Hare quota)

Federal Deputies are elected by **proportional representation** using the **Hare quota with largest remainders**. Each macro-region elects a block of deputies sized by its population. Votes for a party's candidates are pooled, and the region's seats are shared out by that vote share. Within a party, seats go to its candidates in order of their own votes.

- **All 513 seats are contested** each 4-year cycle.
- **A party needs at least 20% of the pooled vote in a macro-region** to win seats there. Parties under that line get none in that region.
- **Primaries advance the top 3 candidates** per party per region.

**Worked example.** Centro-Oeste elects 42 deputies. With 4,200,000 votes cast, one seat costs a quota of 100,000 votes. Party A has 2,100,000 votes (50%), B has 1,260,000 (30%) and C has 840,000 (20%). A gets 21 seats, B gets 12 and C gets 8, which is 41 of 42. The leftover votes are A 0, B 60,000 and C 40,000, so B takes the last seat. Final result: A 21, B 13, C 8.

### Federal Senate: FPTP staggered

Senators are elected by **First Past the Post (FPTP)** from statewide constituencies: each state's block of senators splits across two alternating 8-year classes, so only part of the chamber is up in any cycle.

- **Partial seats contested**: only one class of Senate seats is up per cycle (2 classes).
- **Single-member constituencies** for each contested seat.
- **No snap elections**: the Senate cannot be dissolved.

---

## Presidential elections

The President is **directly elected** by nationwide popular vote (no electoral college). A 2-term limit per character applies. A character who has served two full terms cannot run again. A second-term run blocks VP running-mate selection: the incumbent VP is locked onto the ticket.

Brazil has no parliamentary confidence vote. The President serves the full 4-year term regardless of congressional composition. **Divided government is the default**: one party holds the presidency while a rival coalition controls one or both chambers of Congress. Bills require passage in both chambers and presidential signature. The President can veto legislation; Congress can override with a 2/3 supermajority.

---

## Key Brazilian mechanics

**Two-term presidential limit.** A character cannot serve more than two terms as President. The limit is per-character, not per-party. A second-term run locks the VP running mate: the incumbent VP cannot be swapped, so a President who wants a different running mate has to choose before the first term ends.

**Bicameral legislative loop.** Both the Chamber and the Senate are player-contestable. Bills must pass both chambers to enact. There is no upper-chamber override asymmetry: both chambers have equal legislative weight.

**Coalition management.** A President's party often falls short of 257 Chamber seats, so even a unified presidential party may need allied blocs to pass legislation.

**Staggered Senate.** Only one class of Senate seats is up per cycle (2 classes, 8-year terms). Plan your Senate run for the correct class in your home macro-region.

**No snap elections.** Both chambers have fixed terms. The President cannot dissolve Congress. No-confidence votes do not exist: the President serves the full term.

**Party creation routes through a charter.** Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. Brazil needs 3 regions plus your locked home region, so 4 regions, and 2 NPPs (non-player parties, the game's computer-run parties) spawn in each: 8 NPPs in total.

**Social axis baseline 0.** The social axis runs from socially liberal (−5) to socially conservative (+5). Brazil starts at the center. Drifts toward the social stance of enacted national laws over time.

---

## Career path for Brazilian players

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Federal Deputy | +1 action/turn; national legislature access from the start |
| Parallel | Senator | +2 actions/turn; 8-year terms; staggered classes |
| Mid-game | Governor | +2 actions/turn; controls state executive; 4-year term |
| Top | President | +4 actions/turn; heads state and government; 2-term cap |

Brazil has no sub-national legislature. The first rung is a Federal Deputy seat, contested in your home macro-region.

---

## Currency and economy

| Item | Detail |
| --- | --- |
| Currency | BRL |
| Central Bank | Banco Central do Brasil (BCB) |
| Chair title | Governor of the BCB |
| Default prime rate | 8.0% |
| Stock exchange | B3 |
| Finance Minister | Minister of Finance |

### Economic model

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

---

## Key Brazil links

- [Election Mechanics](/wiki/election-mechanics): Primary and general election rules
- [Political Parties](/wiki/political-parties): the charter that founds a new party
- [Executive Term Limits](/wiki/executive-term-limits): the two-term cap and the locked running mate
- [Multi-Country Play](/wiki/multi-country-play): PR vs FPTP, cross-border investments
- [Core Systems](/wiki/core-systems): Turn structure, action economy
- [Player Progression](/wiki/player-progression): Career ladder details
- [Campaign Strategy](/wiki/campaign-strategy): Fundraising, ads, canvassing

---

**Status:** Brazil is playable in every era, with authored 1953, 1979, 1991 and 2019 economies. Last checked: 2026-10-29, version 1.18.0.

---

## Living history

The timeline below is written by the turn processor whenever a presidential transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
BR
\`\`\`
`;
