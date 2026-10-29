export const ukOverviewContent = `# United Kingdom

The United Kingdom is a **constitutional monarchy and parliamentary democracy** across four nations. There is no directly elected executive: the **Prime Minister** emerges from whichever party can command a majority in the 650-seat House of Commons. Elections can be called early (snap elections). Governments can fall mid-term via no-confidence votes.

---

## Government structure

| Office | How Filled | Term | Seats |
| --- | --- | --- | --- |
| Prime Minister | Confidence vote of Commons MPs | No fixed term | 1 |
| Member of Parliament (MP) | Regional multi-seat election | Up to 5 years | 650 modern / 625 in 1953 |
| Regional Councillor | Multi-seat regional election | Up to 5 years | 578 total |
| Monarch | Imperial character (ceremonial) | Lifetime | 1 |
| Governor of the Bank of England | Appointed action | 4 years | 1 |

**Parliament** consists of two chambers:

- **House of Commons**: 650 elected MPs, chosen in 12 regional multi-seat races across four nations (625 in the 1953 preset). This is the primary legislative chamber and the source of the PM's authority.
- **House of Lords**: 784 appointed and hereditary peers. Revises and scrutinises legislation but cannot block it indefinitely. Lords are not elected and cannot be filled by players.

---

## Nations and election regions

The UK has four nations, but the Commons resolver runs one multi-seat race in each of 12 regions. England is split into nine regions; Scotland, Wales, and Northern Ireland each form one region.

\`\`\`wiki-chart
uk-seats-by-region
\`\`\`

| Region | Code | Modern Commons Seats | Regional Council Seats |
| --- | --- | --- | --- |
| London | LON | 75 | 32 |
| South East England | SEE | 90 | 67 |
| South West England | SWE | 58 | 39 |
| East of England | EAE | 60 | 39 |
| East Midlands | EMI | 47 | 39 |
| West Midlands | WMI | 57 | 18 |
| Yorkshire and the Humber | YHU | 54 | 21 |
| North West England | NWE | 75 | 27 |
| North East England | NEE | 27 | 17 |
| Scotland | SCO | 57 | 129 |
| Wales | WAL | 32 | 60 |
| Northern Ireland | NIR | 18 | 90 |

The 1953 preset uses its own 625-seat Commons map. Your character's home region normally determines where you can stand for Commons, while party leaders have broader access.

---

## How UK elections work

UK Commons elections use **regional multi-seat allocation**. Each region's seats are allocated by the Hare largest-remainder method, in every era.

A party needs at least **10% of the pooled votes in a region** to qualify for seats there. Parties under that line get none, so a small party's votes in a region can count for nothing.

\`\`\`wiki-chart
uk-regional-seat-allocation
\`\`\`

**Worked example.** A region elects 10 MPs and 100,000 votes are cast, so one seat costs a quota of 10,000 votes. Party A has 46,000 votes, B has 34,000 and C has 20,000, all above the 10% line. A gets 4 seats outright, B gets 3 and C gets 2. That is 9 of 10. The last seat goes to the largest leftover: A has 6,000, B has 4,000 and C has 0, so A takes it. Final result: A 5, B 3, C 2.

**Primaries advance the top 3 candidates** per party (not 1 as in the US), so up to three candidates from each party reach the general election.

**How long a race takes.** A Commons election window is 48 turns, which is 48 real hours: 24 for the primary and 24 for the general election. The maximum gap between Commons elections is five years (240 turns, 10 real days).

**No fixed election date.** Commons elections have a maximum five-year term but can be called earlier by the government (snap elections) or triggered by a successful no-confidence vote.

---

## Prime Minister selection

There is no direct vote for Prime Minister. Instead:

1. After Commons elections resolve across all 12 regions, seat totals are summed by party.
2. The **largest party** (by seats) attempts to form a government.
3. A **confidence vote** is held among all 650 elected MPs. The nominee needs more than 50% (326 votes) to be confirmed as PM.
4. If the confidence vote fails, the next-largest party's leader is nominated, and the process repeats.
5. **Minority government**: any party or coalition chair holding at least 100 Commons seats can call a confidence vote and propose a PM, even when a rival bloc has 326+. The Commons votes the bid up or down.

![Loop for forming a UK government: seats by party, largest party nominated, confidence vote, next party on failure, a minority bid route, and a no-confidence vote that clears the cabinet.](/wiki-images/diagrams/uk-overview-pm-formation.svg)

**Worked example.** Labour wins 340 of 650 seats. Its leader is nominated and 326 or more Ayes are needed, so Labour passes with room to spare. If it won only 300 seats, it would need 26 more votes from MPs outside its party. If those do not come, the next-largest party gets its turn.

The PM serves until a new Commons election, resignation, or removal by no-confidence vote. There is no fixed term.

---

## Snap elections and no-confidence votes

These are the two mechanics that have no US equivalent:

**Snap elections**: A sitting Prime Minister can call an early Commons election before the five-year maximum. It resets all regions at once and runs as a 48-hour sprint. A PM can call at most 2 snaps per appointment, with a 336-turn (2 real weeks) cooldown after the first, and cannot call one while a no-confidence vote is open. Calling a snap vacates the PM seat and clears the cabinet, so the winner is chosen through government formation afterward. If no PM is seated within 96 turns, a snap is triggered automatically.

**No-confidence votes**: Any sitting MP, in government or opposition, can table a motion of no confidence against the sitting PM. It needs a majority of the **whole** Commons (326 of 650), so abstentions and absent members count against the motion. The vote lasts 24 hours, and only one motion can run at a time, with at least 48 turns between filings. If it passes, the PM is removed immediately, the cabinet is cleared, and government formation restarts. If it fails, the PM stays. See [No-Confidence Votes](/wiki/no-confidence-votes).

The [Snap Elections](/wiki/snap-elections) guide covers the mechanics and costs in detail.

---

## Regional councils

Each of the 12 UK regions has an elected Regional Council. Councillors propose and vote on regional legislation. Scotland, Wales, Northern Ireland, and London also have elected regional executives who handle assent; English regions without an executive use the configured regional enactment path. Total council seats: **578**.

Winning a Regional Council seat and a Commons seat are mutually exclusive: winning one vacates the other.

In Scotland, Wales, and Northern Ireland, the Regional Council represents the devolved legislature (Scottish Parliament, Senedd Cymru, Northern Ireland Assembly).

---

## The Monarch

The UK has an [imperial character](/wiki/imperial-characters): the Monarch. This is a ceremonial head-of-state role. The Monarch manages the **Royal Estate** corporation, while the elected government controls legislation and executive policy. The Monarch has no vote on legislation or the PM; Royal Assent to national bills is automatic.

---

## Key UK mechanics

**No presidential veto.** When a bill passes the Commons, it receives Royal Assent automatically and is enacted immediately. There is no executive signature step.

**Cabinet resets on government change.** When a new PM is appointed after a confidence vote or no-confidence vote, the entire cabinet is cleared. All ministerial positions become vacant and pending nominations are withdrawn.

**Major parties vary by nation.** When evaluating spoiler effects, the game uses different major-party sets by nation: Labour/Conservative in England, SNP/Labour in Scotland, Labour/Conservative in Wales, DUP/Sinn Féin in Northern Ireland.

**Party creation routes through a charter.** Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. The charter system is country-agnostic; UK-specific gates (presidential-primary lockout) don't apply here.

**Government approval** is computed from the country's own metrics and the national effects layered on them (a war, a national address, international statements, the state of the cabinet), not from the PM's favorability. See [Government Approval](/wiki/government-approval).

**The Chancellor's Budget changes the law.** The annual Budget bundles real tax rates and statutory programme levels (the NHS included) into one Commons confidence vote. It shares a single fiscal ledger with ordinary legislation, so a later Act or a later Budget controls each setting. The Treasury page shows a forecast of revenue, spending, balance and the tax phase-in before the package is tabled. If no Chancellor is appointed, the Prime Minister may act until the vacancy is filled.

**The Bank of England answers to the Treasury before 1997.** A world that opens before the 1997 independence grant starts with the Treasury setting Bank Rate and no rate committee; Parliament can legislate the transfer either way. There is no FOMC-style committee here in any era: the Governor sets the rate alone once the bank is independent.

---

## Currency and economy

| Item | Detail |
| --- | --- |
| Currency | GBP |
| Central Bank | Bank of England (BoE) |
| Chair title | Governor of the Bank of England |
| Default prime rate | 3.0% |
| Stock exchange | FTSE |
| Finance Minister | Chancellor of the Exchequer |

---

## Key UK links

- [No-Confidence Votes](/wiki/no-confidence-votes): how a motion is tabled and counted
- [Government Approval](/wiki/government-approval): what drives the government's standing
- [Snap Elections](/wiki/snap-elections): How and when snap elections are triggered
- [Cabinet Guide](/wiki/cabinet-guide): every cabinet post, its metrics, and its actions
- [Referendums](/wiki/referendums): independence and Northern Ireland reunification campaigns
- [Election Mechanics](/wiki/election-mechanics): Shared primary/general concepts
- [Core Systems](/wiki/core-systems): Turn structure, action economy
- [Player Progression](/wiki/player-progression): Career ladder details

---

**Status:** the United Kingdom is playable in every era. The 1953 preset uses a 625-seat Commons, and a world that opens before 1997 starts with the Treasury setting Bank Rate. Last checked: 2026-10-29, version 1.18.0.

---

## Living history

The timeline below is written by the turn processor whenever a head-of-government transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
UK
\`\`\`
`;
