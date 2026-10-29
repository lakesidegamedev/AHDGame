export const ukOverviewContent = `# United Kingdom

Nobody in the United Kingdom is elected Prime Minister. You win seats, then you win a confidence vote among the MPs, and you keep the job only as long as the Commons lets you. The UK is a **constitutional monarchy and parliamentary democracy** across four nations, with a 650-seat House of Commons, early elections at the PM's call, and governments that can fall mid-term.

## Getting to 326: forming a government

There is no direct vote for Prime Minister. Instead:

1. After Commons elections resolve across all 12 regions, seat totals are summed by party.
2. The **largest party** (by seats) attempts to form a government.
3. A **confidence vote** is held among all 650 elected MPs. The nominee needs more than 50% (326 votes) to be confirmed as PM.
4. If the confidence vote fails, the next-largest party's leader is nominated, and the process repeats.
5. **Minority government**: any party or coalition chair holding at least 100 Commons seats can call a confidence vote and propose a PM, even when a rival bloc has 326+. The Commons votes the bid up or down.

![Loop for forming a UK government: seats by party, largest party nominated, confidence vote, next party on failure, a minority bid route, and a no-confidence vote that clears the cabinet.](/wiki-images/diagrams/uk-overview-pm-formation.svg)

Say Labour wins 340 of 650 seats. Its leader is nominated and 326 or more Ayes are needed, so Labour passes with room to spare. If it won only 300 seats, it would need 26 more votes from MPs outside its party. If those do not come, the next-largest party gets its turn.

The PM serves until a new Commons election, resignation, or removal by no-confidence vote. There is no fixed term. When a new PM is appointed, the entire cabinet is cleared: all ministerial positions become vacant and pending nominations are withdrawn. See the [Cabinet Guide](/wiki/cabinet-guide) for every post, its metrics and its actions.

## Losing the Commons

Two mechanics have no US equivalent.

**No-confidence votes.** Any sitting MP, in government or opposition, can table a motion of no confidence against the sitting PM. It needs a majority of the **whole** Commons (326 of 650), so abstentions and absent members count against the motion. The vote lasts 24 hours, and only one motion can run at a time, with at least 48 turns between filings. If it passes, the PM is removed immediately, the cabinet is cleared, and government formation restarts. If it fails, the PM stays. See [No-Confidence Votes](/wiki/no-confidence-votes).

**Snap elections.** A sitting PM can call an early Commons election before the five-year maximum. It resets all regions at once and runs as a 48-hour sprint. A PM can call at most 2 snaps per appointment, with a 336-turn (2 real weeks) cooldown after the first, and cannot call one while a no-confidence vote is open. Calling a snap vacates the PM seat and clears the cabinet, so the winner is chosen through government formation afterward. If no PM is seated within 96 turns, a snap is triggered automatically. The [Snap Elections](/wiki/snap-elections) guide covers the mechanics and costs in detail.

How well the government is regarded is computed from the country's own metrics and the national effects layered on them (a war, a national address, international statements, the state of the cabinet), not from the PM's favorability. See [Government Approval](/wiki/government-approval).

When a bill passes the Commons, it receives Royal Assent automatically and is enacted immediately. There is no presidential veto and no executive signature step.

## Winning a Commons seat

Commons elections use **regional multi-seat allocation**. The Commons resolver runs one race in each of 12 regions: England is split into nine, and Scotland, Wales and Northern Ireland each form one. Each region's seats are allocated by the Hare largest-remainder method, in every era. A party needs at least **10% of the pooled votes in a region** to qualify for seats there, so a small party's votes in a region can count for nothing.

Your character's home region normally determines where you can stand for Commons, while party leaders have broader access. **Primaries advance the top 3 candidates** per party (not 1 as in the US), so up to three candidates from each party reach the general election.

| Region | Code | Modern Commons seats | Regional Council seats |
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

\`\`\`wiki-chart
uk-seats-by-region
\`\`\`

The 1953 preset uses its own 625-seat Commons map.

Take a region that elects 10 MPs with 100,000 votes cast, so one seat costs a quota of 10,000 votes. Party A has 46,000 votes, B has 34,000 and C has 20,000, all above the 10% line. A gets 4 seats outright, B gets 3 and C gets 2. That is 9 of 10. The last seat goes to the largest leftover: A has 6,000, B has 4,000 and C has 0, so A takes it. Final result: A 5, B 3, C 2.

\`\`\`wiki-chart
uk-regional-seat-allocation
\`\`\`

A Commons election window is 48 turns, which is 48 real hours: 24 for the primary and 24 for the general election. The maximum gap between Commons elections is five years (240 turns, 10 real days). There is no fixed date: the government can call one earlier, or a successful no-confidence vote can trigger it.

## Offices

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| Prime Minister | Confidence vote of Commons MPs | No fixed term | 1 |
| Member of Parliament (MP) | Regional multi-seat election | Up to 5 years | 650 modern / 625 in 1953 |
| Regional Councillor | Multi-seat regional election | Up to 5 years | 578 total |
| Monarch | Imperial character (ceremonial) | Lifetime | 1 |
| Governor of the Bank of England | Appointed action | 4 years | 1 |

The **House of Commons** (650 elected MPs, 625 in the 1953 preset) is the primary legislative chamber and the source of the PM's authority. The **House of Lords** (784 appointed and hereditary peers) revises and scrutinises legislation but cannot block it indefinitely. Lords are not elected and cannot be filled by players.

**Regional councils.** Each of the 12 regions has an elected Regional Council whose councillors propose and vote on regional legislation. Scotland, Wales, Northern Ireland and London also have elected regional executives who handle assent; English regions without an executive use the configured regional enactment path. Winning a Regional Council seat and a Commons seat are mutually exclusive: winning one vacates the other. In Scotland, Wales and Northern Ireland, the Regional Council represents the devolved legislature (Scottish Parliament, Senedd Cymru, Northern Ireland Assembly). Independence and Northern Ireland reunification campaigns run through [Referendums](/wiki/referendums).

**The Monarch.** The UK has an [imperial character](/wiki/imperial-characters), the Monarch, a ceremonial head of state. The Monarch manages the **Royal Estate** corporation, while the elected government controls legislation and executive policy. The Monarch has no vote on legislation or the PM, and Royal Assent to national bills is automatic.

## Small print worth knowing

**Major parties vary by nation.** When evaluating spoiler effects, the game uses different major-party sets by nation: Labour/Conservative in England, SNP/Labour in Scotland, Labour/Conservative in Wales, DUP/Sinn Féin in Northern Ireland. See [Election Mechanics](/wiki/election-mechanics) for the shared primary and general concepts.

**Party creation routes through a charter.** Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. The charter system is country-agnostic; UK-specific gates (presidential-primary lockout) don't apply here.

## The Chancellor and the Bank of England

The annual Budget bundles real tax rates and statutory programme levels (the NHS included) into one Commons confidence vote. It shares a single fiscal ledger with ordinary legislation, so a later Act or a later Budget controls each setting. The Treasury page shows a forecast of revenue, spending, balance and the tax phase-in before the package is tabled. If no Chancellor is appointed, the Prime Minister may act until the vacancy is filled.

A world that opens before the 1997 independence grant starts with the Treasury setting Bank Rate and no rate committee; Parliament can legislate the transfer either way. There is no FOMC-style committee here in any era: the Governor sets the rate alone once the bank is independent.

| Item | Detail |
| --- | --- |
| Currency | GBP |
| Central Bank | Bank of England (BoE) |
| Chair title | Governor of the Bank of England |
| Default prime rate | 3.0% |
| Stock exchange | FTSE |
| Finance Minister | Chancellor of the Exchequer |

## Living history

The timeline below is written by the turn processor whenever a head-of-government transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
UK
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy, and [Player Progression](/wiki/player-progression) for career ladder details.

Playable in every era. The 1953 preset uses a 625-seat Commons, and a world that opens before 1997 starts with the Treasury setting Bank Rate. Last checked 2026-10-29, version 1.18.0.
`;
