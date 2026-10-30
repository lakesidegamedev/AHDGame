export const ieOverviewContent = `# Ireland

Ireland comes down to one number: **81**, a bare majority of the 160-seat Dáil Éireann. A **parliamentary republic** and a small open economy on the Atlantic edge of Europe, it has no single-party majority tradition, so whoever wants to be Taoiseach has to assemble 81 votes out of a fragmented chamber. The live allocator uses Hare-quota proportional representation with largest remainders; ranked STV transfers are not yet simulated.

## Finding 81 votes

The **coalition threshold is 81 seats** (160 / 2 + 1). The Dáil is smaller or larger in some presets: 147 seats in 1953 (74 for a majority) and 166 in 1999 and 2007 (84). A party or coalition holding a majority can form a government and propose a Taoiseach through a confidence vote among all TDs.

![Taoiseach formation from the Dail election through a majority nomination or a minority bid to a confidence vote among all TDs.](/wiki-images/diagrams/ie-overview-taoiseach-formation.svg)

**Minority government**: any party or coalition chair holding at least **25 Dáil seats** (15.38% of the chamber, rounded up) can propose a Taoiseach and call a confidence vote, even without 81. The Dáil votes the bid up or down.

After an election, picture Fine Gael on 60 seats, Fianna Fáil on 45, Labour on 12 and the Greens on 8. Fine Gael plus Labour plus the Greens is 80, one short of 81. Fine Gael plus Fianna Fáil is 105, which passes with 24 to spare. The confidence vote itself passes with more ayes than nays, but a government short of 81 governs as a minority, so every missing seat has to be found among independents or other parties.

**Coalition government is the norm.** The two major parties are **Fine Gael** and **Fianna Fáil**, but neither typically governs alone. Coalitions (Fine Gael + Labour, Fianna Fáil + Greens, and so on) typically include one of the major parties plus smaller partners (Labour, Greens, independents). The 81-seat threshold decides whether a government counts as a majority, and the 25-seat bar decides who may bid at all.

If the government loses Dáil confidence, the Taoiseach falls and formation restarts (see [No-Confidence Votes](/wiki/no-confidence-votes)). The Taoiseach can also dissolve the Dáil and call an early election, mechanically similar to UK, JP and DE snap elections (see [Snap Elections](/wiki/snap-elections)). The [Cabinet Guide](/wiki/cabinet-guide) lists every post the winning coalition fills.

## How Dáil seats are won

Dáil elections currently use a generic **Hare-quota largest-remainder** allocator, the same proportional allocator used by several multi-seat chambers. It approximates proportional multi-seat results, but it does not model ranked ballots, surplus transfers, or eliminations. Wiki references to STV describe the real institution, not the live resolver; a future true-STV implementation would need ranked ballots and transfer rounds that the current resolver does not perform.

- **A party needs at least 10% of the pooled vote in a region** to win any seats there. Parties under the line get none.
- **Primaries advance the top 3 candidates** per party per region (same as the UK / JP / DE rule, not the US top-1 rule).
- **All Dáil seats are contested** in each cycle: no staggered classes. The Dáil term is 5 years (240 turns, 10 real days), and an election window is 48 turns (48 real hours: 24 for the primary, 24 for the general).

See [Election Mechanics](/wiki/election-mechanics) for the shared primary and general rules, and [Multi-Country Play](/wiki/multi-country-play) for proportional versus FPTP systems and cross-border investments.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| Taoiseach (head of government) | Confidence vote of Dáil members | No fixed term | 1 |
| Tánaiste (deputy head of government) | Appointed by Taoiseach | No fixed term | 1 |
| Uachtarán na hÉireann (President, head of state) | Direct election | 7 years | 1 |
| Teachta Dála (TD) | Hare-quota multi-seat election | 5 years | 160 |
| Cathaoirleach (regional executive) | FPTP regional election | 5 years | 1 per region |
| Local Councillor | Multi-seat local election | 5 years | 200 total |
| Governor of the Central Bank of Ireland | Nominated by the Taoiseach, then drawn | 4 years | 1 |

## Why the Seanad doesn't matter for bills

The **Oireachtas** is bicameral in name. The **Dáil Éireann** has 160 TDs, allocated proportionally across multi-seat constituencies, and it is the source of the Taoiseach's authority. The **Seanad Éireann** has 60 senators (43 elected from vocational panels, 11 nominated by the Taoiseach, and 6 from universities). It is partly elected and partly appointed, and it is **not part of the player legislative loop**.

So the legislature is mechanically **unicameral**: bills do not require Seanad passage to enact, and the Seanad cannot block or amend them in gameplay. This is on purpose: the Seanad is mostly appointed or chosen by vocational panels, so it would add a chamber with no real contest for players.

## The President and the local tier

The **Uachtarán na hÉireann** is a directly elected ceremonial head of state, distinct from the Taoiseach. Open the live office at [Áras an Uachtaráin](/country/ie/executive/aras).

- **7-year term**: one of the longest in the game (Brazil's senators serve 8).
- **2-term lifetime limit per character**: a character cannot be elected to a third term, even after a break.
- **+3 actions per turn** while in office.
- **Party strength weight 0.5**: the party-strength weight is how much an office counts toward your party's standing. The ceremonial presidency counts less than the Taoiseach (1.0) or a TD (0.85).

The President does not introduce legislation and has no veto. The office is a strategic prestige and action-bonus target rather than a legislative lever. The **Tánaiste** is the deputy head of government, filled through cabinet appointment.

**Local government.** Ireland has a **Local Council** tier: 200 elected councillors representing NUTS-III planning regions (the EU's standard statistical regions, used here as Ireland's regions). A councillor earns +1 action per turn and is the cheapest entry rung. Councillors exercise delegated local-government functions and vote on regional legislation, and bills passed at the local level have regional policy effects.

Each region has a regional executive, the **Cathaoirleach**, using the same office as a Governor in other countries. The display label diverges per region: Lord Mayor of Dublin (DUB), Lord Mayor of Cork (COR), Mayor of Limerick (LIM), Mayor of Galway (GAL), and Cathaoirleach elsewhere.

## Career: from council to Taoiseach

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Teachta Dála (TD) | +1 action/turn; national legislature access from the start |
| Mid-game | Cathaoirleach | +2 actions/turn; controls regional executive; 5-year term |
| Parallel | Uachtarán | +3 actions/turn; 7-year term; 2-term cap; ceremonial head of state |
| Top | Taoiseach | +4 actions/turn; heads government; requires winning a Dáil confidence vote |

The Local Council is Ireland's lowest elected tier, and a Dáil seat is the first rung of national play. A councillor can run for the Dáil from the same region. See [Player Progression](/wiki/player-progression) for the general ladder.

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. IE-specific gates don't apply. A ratified charter seeds 3 founding NPPs: one in the lead founder's home region and two in regions the founders pick.

The **social axis** is the scale on which the game places a country's voters from libertarian (−5) to authoritarian (+5). Ireland starts at −1.5, slightly toward the libertarian end, and drifts toward the social stance of the national laws enacted over time.

## Money, and three starting years

Ireland starts with the Irish pound in pre-euro presets and can display the euro after Eurozone adoption. Its configured central-bank office is the **Governor of the Central Bank of Ireland**, not an independently contested ECB presidency. The ECB side of this is covered in [International Organizations](/wiki/international-organizations).

| Item | Detail |
| --- | --- |
| Currency | IEP (shown as € eq. from the 1999 preset on); EUR display after Eurozone adoption |
| Central Bank | Central Bank of Ireland |
| Chair title | Governor of the Central Bank of Ireland |
| Default prime rate | 3.0% (4.5% opening rate in the 1991 preset); set by the Central Bank of Ireland until a euro union is founded |
| Stock exchange | ISEQ |
| Finance Minister | Minister for Finance |

Ireland is seeded in **every preset**, each with its own regional data. Its starting economic model depends only on whether the world starts before 2005:

| Start | Model | Description |
| --- | --- | --- |
| 1953, 1979, 1991, 1999 | Agrarian | From De Valera's protectionist, high-emigration Ireland to the years before the Celtic Tiger |
| 2007 onward (2019 is the default) | Tech innovation | Modern Ireland: a tech-driven, FDI-led innovation economy |

A modern-start Ireland begins as a **tech innovation** economy: the same modern model as the US. An earlier start begins as agrarian and can modernize over time through play.

## Northern Ireland reunification

The reunification path runs through [Referendums](/wiki/referendums). If Ireland is already open to players when a reunification vote passes, the Dáil must also pass an admission bill.

## Living history

The timeline below is written by the turn processor whenever a national event happens in-game: a change of leader, a national law enacted, an alliance joined or left, a referendum, or a region transferred. Each entry is a real event from this save.

\`\`\`country-history
IE
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Ireland runs as an economy preview in every preset: its economy is simulated, but its offices are closed to players unless an admin opens the country. A Northern Ireland reunification moves the region into Ireland without opening it. Last checked 2026-10-30, version 1.18.0.
`;
