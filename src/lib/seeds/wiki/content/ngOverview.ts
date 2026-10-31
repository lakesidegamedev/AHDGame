export const ngOverviewContent = `# Nigeria

Winning Nigeria's presidency outright takes more than the most votes: the leader also needs at least 25% in at least 4 of the 6 geopolitical zones, or the race goes to a run-off. Nigeria is a **federal presidential republic**, Africa's most populous democracy, with a directly elected President on a fixed 4-year term (2 terms per character) and a bicameral National Assembly. House and Senate seats are decided zone by zone.

Nigeria is in **every preset** as an economy preview. **Can I play it?** Only in a world where an admin has opened Nigeria to players. Otherwise its economy and elections still run, computer-run politicians hold its offices, and you cannot choose it as your country. Check the country list when you create or join a world.

## Winning the presidency with a spread of zones

The President is elected by **nationwide popular vote with a spread requirement**. To win outright, the candidate with the most national votes must also win **at least 25% of the vote in at least 4 of the 6 zones**. If the leader misses the spread test, the top two candidates go to a run-off. The second round is not campaigned yet: the run-off is settled at once in favour of the finalist with more national votes, so in practice the national vote leader always takes office.

![Decision tree for Nigerian presidential elections: the national vote leader wins outright with 25% in at least 4 of 6 zones, otherwise the top two go to a run-off.](/wiki-images/diagrams/ng-overview-spread-rule.svg)

A candidate leads nationally with 38%. Their share is 41%, 33% and 27% in three zones and below 25% in the other three. They cleared 3 zones, not 4, so there is a run-off against the runner-up, which the 38% leader wins on national votes. Only the national leader is tested: a runner-up with 31% who clears 25% in 4 zones does not win outright.

A 2-term limit per character applies: a character who has been elected President twice cannot run again. The limit also reaches the running mate: a character who has served two presidential terms cannot be picked as Vice President. The limit is per-character, not per-party (see [Executive Term Limits](/wiki/executive-term-limits)).

Nigeria has no parliamentary confidence vote. The President serves the full 4-year term regardless of National Assembly composition, and there is no legislative mechanism to remove the President mid-term through a standard vote. **Divided government is common**: one party holds the presidency while a rival controls one or both chambers. Bills require passage in both chambers and then go to the President, who has 10 turns to sign or veto; a bill left alone is signed automatically. See below for what happens after a veto.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| Senator | Multi-seat zone election | 4 years | 109 |
| Representative | Multi-seat zone election | 4 years | 360 (136 in 1953) |
| Assembly Member (State House of Assembly) | Multi-seat zone election | 4 years | 990 |
| Governor | FPTP zone-wide election | 4 years | 1 per zone (6) |
| Governor of the CBN | Nominated by the President, then drawn | 4 years | 1 |

The **President** is both head of state and head of government.

## Seats zone by zone

Nigeria's legislature has two chambers, and **both participate in the player legislative loop**: bills require passage in both the Senate and the House of Representatives, and both have equal legislative weight.

- **House of Representatives**: 360 Representatives, elected zone by zone and allocated across the six geopolitical zones (North West, North East, North Central, South West, South South, South East) by population. 4-year terms (192 turns, 8 real days). **All seats are contested** each cycle. The House is the primary legislative body and the source of the coalition threshold.
- **Senate**: 109 senators, elected zone by zone. 4-year terms. **All seats are contested** each cycle. The Senate reviews legislation from the House and can reject bills.

\`\`\`wiki-chart
ng-seats-by-zone
\`\`\`

| Zone | House | Senate | State House of Assembly |
| --- | --- | --- | --- |
| North West | 95 | 21 | 259 |
| North East | 50 | 18 | 137 |
| North Central | 53 | 18 | 146 |
| South West | 72 | 18 | 197 |
| South South | 47 | 18 | 134 |
| South East | 43 | 16 | 117 |
| **Total** | **360** | **109** | **990** |

Each of the six zones runs one election for its House seats and one for its Senate seats. Seats in a zone are shared out by vote share (the Hare largest remainder method), and a party needs at least **20% of the zone's pooled vote** to win any seat there. There are no staggered classes. That gate rewards geographic concentration: a party with 40% in one zone can win dozens of seats there while winning almost nothing elsewhere, so concentrated regional support overperforms relative to national vote share.

The North East elects 50 Representatives. With 1,010,000 votes cast, one seat costs a quota of 20,200 votes. Party A has 600,000 votes and party B has 410,000, both above the 20% line. A gets 29 seats and B gets 20, which is 49 of 50. A has 14,200 left over and B has 6,000, so A takes the last seat. Final result: A 30, B 20. A party with 18% of the vote would win nothing in that zone.

Nigeria is a presidential country, so one candidate per party advances from a primary. See [Election Mechanics](/wiki/election-mechanics) for the shared rules and [Campaign Strategy](/wiki/campaign-strategy) for fundraising, ads and canvassing.

### The 181-seat line

The **coalition threshold is 181 seats** (a bare majority of the 360-seat House: 360 / 2 + 1; 69 of 136 in the 1953 preset). A party or coalition holding 181+ seats can carry House votes on its own.

Unlike parliamentary systems, the threshold does **not** determine who governs, and no mechanic reads it directly: each chamber passes a bill with more ayes than nays. A presidential veto opens a 24-hour override vote, but Nigeria's bill cycle currently has no step that counts it, so in practice a veto stands.

A party holds 150 House seats and wants a bill through without the President's party. It needs 31 more votes to reach 181.

Nigeria's two major parties are **APC** (All Progressives Congress, centre-right) and **PDP** (Peoples Democratic Party, centrist). Unlike Brazil's highly fragmented system, Nigeria's two-party dominance produces clearer legislative majorities.

There are **no snap elections** (the President cannot dissolve the National Assembly) and **no confidence votes**.

## Founding a party and climbing the ladder

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. A ratified charter seeds 3 founding NPPs (computer-run politicians): one in the lead founder's home zone and two in zones the founders pick.

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Assembly Member | +1 action/turn; cheapest race, builds favorability and PI in your home zone |
| Parallel | Representative | +1 action/turn; national legislature access |
| Mid-game | Senator or Governor | +2 actions/turn; either federal upper chamber or state executive |
| Top | President | +4 actions/turn; heads state and government; 2-term cap |

The State House of Assembly is Nigeria's sub-national legislature: a 990-seat body elected by the six zones and allocated by zone population (see the table above). It is the cheapest entry point, similar to a US State Senate seat. See [Player Progression](/wiki/player-progression) for career ladder details.

## The naira and a high-inflation baseline

Nigeria's central bank operates in a structurally higher rate environment than most countries. **Why is Nigeria high inflation?** The game anchors its inflation target and neutral rate to the naira's history of weakness, so the central bank treats a higher inflation rate as normal.

| Item | Detail |
| --- | --- |
| Currency | NGN |
| Central Bank | Central Bank of Nigeria (CBN) |
| Chair title | Governor of the CBN |
| Default prime rate | 12.0% (5.0% opening rate in the 1991 preset) |
| Stock exchange | NGX |
| Finance Minister | Minister of Finance |

The game tracks a **target inflation** rate and a **neutral prime rate** (the interest rate that neither speeds up nor slows down the economy). The central bank's rate rule reacts to the gap between actual and target inflation.

| Era | Target inflation | Neutral prime rate | Starting exchange rate (NGN per USD) |
| --- | --- | --- | --- |
| Modern | 6.0% | 12.0% | 1,550 (about 0.00064 USD per NGN) |
| 1991 | 12.0% | 15.0% | 9.9 |
| 1979 | 10.0% | 10.0% | 0.6 |
| 1953 | 2.0% | 3.5% | 0.357 |

The 1953 anchors reflect the colonial sterling peg: UK-level price stability rather than the post-independence naira regime. As a world's in-game year advances, the anchors move year by year between authored points at 1953, 1971, 1979 and 1991, reaching the modern values in 1999. They set what the central bank treats as "on target". They are not fixed rates, so actual inflation and the prime rate still respond to conditions each turn. The CBN Governor's prime rate decisions ripple through borrowing costs, inflation and GDP growth nationwide.

## Living history

The timeline below is written by the turn processor whenever a national event happens in-game: a change of leader, a national law enacted, an alliance joined or left, or a region transferred. Each entry is a real event from this save.

\`\`\`country-history
NG
\`\`\`

See also: [Cabinet Guide](/wiki/cabinet-guide) for every cabinet post, [Multi-Country Play](/wiki/multi-country-play) for FPTP versus PR and cross-border investments, and [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Nigeria runs as an economy preview in every preset and is playable only where an admin has opened it. The 1953, 1979 and 1991 starts have their own authored monetary anchors. Last checked 2026-10-30, version 1.18.0.
`;
