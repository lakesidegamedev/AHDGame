export const ngOverviewContent = `# Nigeria

Nigeria is a **federal presidential republic**: Africa's most populous democracy, with a directly elected President and a bicameral National Assembly, modelled across **six geopolitical zones** (North West, North East, North Central, South West, South South, South East). The President serves a fixed 4-year term with a 2-term limit per character. The President is elected nationwide with a spread rule across the zones, and House and Senate seats are decided zone by zone.

Nigeria is part of the **1991 scenario roster** (US, UK, JP, DE, CN, BR, IE, NG). **Can I play it?** Only in a world where Nigeria has been opened to players. In a world where it has not, Nigeria's elections do not run and you cannot choose it as your country. Check the country list when you create or join a world.

---

## Government structure

| Office | How Filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| Senator | Multi-seat zone election | 4 years | 109 |
| Representative | Multi-seat zone election | 4 years | 360 |
| Assembly Member (State House of Assembly) | Multi-seat zone election | 4 years | 990 |
| Governor | FPTP zone-wide election | 4 years | 1 per zone (6) |
| Governor of the CBN | Appointed action | 5 years | 1 |

The **President** is both head of state and head of government: directly elected for a fixed 4-year term. A 2-term limit per character applies, and a second-term run blocks running-mate selection (the VP cannot be changed on a re-election bid).

The **National Assembly** is bicameral and **both chambers participate in the player legislative loop**: bills require passage in both the Senate and the House of Representatives.

---

## National Assembly

Nigeria's legislature has two chambers:

- **House of Representatives**: 360 Representatives, elected zone by zone and allocated across the six geopolitical zones by population. 4-year terms (192 turns, 8 real days). **All seats are contested** each cycle. The House is the primary legislative body and the source of the coalition threshold.
- **Senate**: 109 senators, elected zone by zone. 4-year terms. **All seats are contested** each cycle. The Senate reviews legislation from the House and can amend or reject bills.

| Zone | House | Senate | State House of Assembly |
| --- | --- | --- | --- |
| North West | 95 | 21 | 259 |
| North East | 50 | 18 | 137 |
| North Central | 53 | 18 | 146 |
| South West | 72 | 18 | 197 |
| South South | 47 | 18 | 134 |
| South East | 43 | 16 | 117 |
| **Total** | **360** | **109** | **990** |

---

## Coalition threshold

The **coalition threshold is 181 seats** (a bare majority of the 360-seat House of Representatives: 360 / 2 + 1). A party or coalition holding 181+ seats controls the House.

Unlike parliamentary systems, the threshold does **not** determine who governs: the President is directly elected and serves a fixed term regardless of legislative composition. Instead, the 181-seat threshold matters for **legislative agenda control**: which party chairs committees and drives floor votes. A presidential veto opens a 24-hour override vote that needs two-thirds of all seats in both chambers.

**Worked example.** A party holds 150 House seats and wants a bill through without the President's party. It needs 31 more votes to reach 181. To override a veto it would need 240 of the 360 House seats (two-thirds) and 73 of the 109 Senate seats.

Nigeria's two major parties are **APC** (All Progressives Congress, centre-right) and **PDP** (Peoples Democratic Party, centre-left). Unlike Brazil's highly fragmented system, Nigeria's two-party dominance produces clearer legislative majorities, but cross-party coalitions still matter for veto overrides and constitutional amendments.

---

## How Nigerian elections work

Each of the six zones runs one election for its House seats and one for its Senate seats. Seats in a zone are shared out by vote share (the Hare largest remainder method), and a party needs at least **20% of the zone's pooled vote** to win any seat there. There are no staggered classes.

**Worked example.** The North East elects 50 Representatives. With 1,010,000 votes cast, one seat costs a quota of 20,200 votes. Party A has 600,000 votes and party B has 410,000, both above the 20% line. A gets 29 seats and B gets 20, which is 49 of 50. A has 14,200 left over and B has 6,000, so A takes the last seat. Final result: A 30, B 20. A party with 18% of the vote would win nothing in that zone.

- **No snap elections.** Both chambers have fixed 4-year terms. The President cannot dissolve the National Assembly.
- **No confidence votes.** The President serves the full term regardless of legislative composition.
- **Primaries**: Nigeria is a presidential country, so one candidate per party advances from a primary.
- A concentrated regional vote still pays off: a party with 40% in one zone can win dozens of seats there while winning almost nothing elsewhere.

---

## Presidential elections

The President is elected by **nationwide popular vote with a spread requirement**. To win outright, the candidate with the most national votes must also win **at least 25% of the vote in at least 4 of the 6 zones**. If nobody meets both tests, the top two candidates go to a run-off.

**Worked example.** A candidate leads nationally with 38%. Their share is 41%, 33% and 27% in three zones and below 25% in the other three. They cleared 3 zones, not 4, so there is a run-off against the runner-up. A different candidate with 31% nationally who clears 25% in 4 zones would win outright, because the spread test counts zones, not a majority.

A 2-term limit per character applies. A character who has served two full terms cannot run again. A second-term run locks the VP running mate: the incumbent VP cannot be swapped.

Nigeria has no parliamentary confidence vote. The President serves the full 4-year term regardless of National Assembly composition. **Divided government is common**: one party holds the presidency while a rival controls one or both chambers. Bills require passage in both chambers and presidential signature. The President can veto legislation, and the National Assembly can override as described above.

---

## Key Nigerian mechanics

**Two-term presidential limit.** A character cannot serve more than two terms as President. The limit is per-character, not per-party. A second-term run locks the VP running mate: the incumbent VP cannot be swapped.

**Bicameral legislative loop.** Both the House and the Senate are player-contestable. Bills must pass both chambers to enact. Both chambers have equal legislative weight: there is no upper-chamber override asymmetry.

**Zone-based seats with a 20% gate.** Seats in each zone go to parties above 20% of that zone's vote. This produces geographic-concentration-driven outcomes: a party with concentrated regional support overperforms relative to its national vote share.

**State House of Assembly.** Each of Nigeria's six geopolitical zones elects Assembly Members to a 990-seat State House of Assembly (the "Assembly Member" office), allocated by zone population (see the table above).

**No snap elections.** Both chambers have fixed 4-year terms. The President cannot dissolve the National Assembly.

**No confidence votes.** The President serves the full term. There is no legislative mechanism to remove the President mid-term through a standard vote.

**Party creation routes through a charter.** Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. Nigeria needs 3 zones plus your locked home zone, so 4 zones, and 2 NPPs (non-player parties, the game's computer-run parties) spawn in each: 8 NPPs in total.

**High-inflation monetary baseline.** Nigeria's central bank operates in a structurally higher rate environment than most countries. **Why is Nigeria high inflation?** The game anchors its inflation target and neutral rate to the naira's history of weakness, so the central bank treats a higher inflation rate as normal. See the table below.

---

## Career path for Nigerian players

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Assembly Member | +1 action/turn; cheapest race, builds favorability and PI in your home zone |
| Parallel | Representative | +1 action/turn; national legislature access |
| Mid-game | Senator or Governor | +2 actions/turn; either federal upper chamber or state executive |
| Top | President | +4 actions/turn; heads state and government; 2-term cap |

The State House of Assembly is Nigeria's sub-national legislature: the cheapest entry point, similar to a US State Senate seat.

---

## Currency and economy

| Item | Detail |
| --- | --- |
| Currency | NGN |
| Central Bank | Central Bank of Nigeria (CBN) |
| Chair title | Governor of the CBN |
| Default prime rate | 12.0% |
| Stock exchange | None |
| Finance Minister | Minister of Finance |

### Monetary baselines

The game tracks a **target inflation** rate and a **neutral prime rate** (the interest rate that neither speeds up nor slows down the economy). The central bank's rate rule reacts to the gap between actual and target inflation.

| Era | Target inflation | Neutral prime rate | Starting exchange rate (NGN per USD) |
| --- | --- | --- | --- |
| Modern | 6.0% | 12.0% | 1,550 (about 0.00064 USD per NGN) |
| 1991 | 12.0% | 15.0% | 9.9 |
| 1979 | 10.0% | 10.0% | 0.6 |
| 1953 | 2.0% | 3.5% | 0.357 |

The 1953 anchors reflect the colonial sterling peg: UK-level price stability rather than the post-independence naira regime. The anchors graduate automatically as a world's in-game year advances past 1971, 1979 and 1991. They set what the central bank treats as "on target". They are not fixed rates, so actual inflation and the prime rate still respond to conditions each turn. The CBN Governor's prime rate decisions ripple through borrowing costs, inflation and GDP growth nationwide.

---

## Key Nigeria links

- [Cabinet Guide](/wiki/cabinet-guide): every cabinet post, its metrics, and its actions
- [Election Mechanics](/wiki/election-mechanics): Primary and general election rules
- [Multi-Country Play](/wiki/multi-country-play): FPTP vs PR, cross-border investments
- [Political Parties](/wiki/political-parties): the charter that founds a new party
- [Executive Term Limits](/wiki/executive-term-limits): the two-term cap and the locked running mate
- [Core Systems](/wiki/core-systems): Turn structure, action economy
- [Player Progression](/wiki/player-progression): Career ladder details
- [Campaign Strategy](/wiki/campaign-strategy): Fundraising, ads, canvassing

---

**Status:** Nigeria is playable only in worlds where it has been opened to players. The 1953, 1979 and 1991 starts have their own authored monetary anchors. Last checked: 2026-10-29, version 1.18.0.

---

## Living history

The timeline below is written by the turn processor whenever a presidential transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
NG
\`\`\`
`;
