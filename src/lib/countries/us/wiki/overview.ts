export const usOverviewContent = `# United States

In the United States nobody hands you power: the President is elected directly, serves four fixed years, and cannot be removed by Congress through a standard vote. The country is a **federal presidential republic** with 50 states, a bicameral Congress, and elected offices down to the state level. Most of the game here is the climb, and the climb starts at a state legislature.

## Where to start and how the climb works

State Senator is the cheapest race to enter. It builds the favorability and Political Influence you need for everything above it, and it carries +1 action per turn. See [Player Progression](/wiki/player-progression) for the general ladder.

1. **State Senator**: cheapest entry, builds favorability and Political Influence in your home state.
2. **Governor** or **U.S. Representative**: a state executive role, or a step into the federal legislature (+2 actions per turn for a Governor).
3. **U.S. Senator**: longer terms, +2 actions per turn, and a vote on federal appointments.
4. **President**: top of the ladder, +4 actions per turn, head of state and head of government. No coalition required.

![Career ladder from State Senator through Governor or Representative and Senator to President, with the extra actions per turn at each rung.](/wiki-images/diagrams/us-overview-career-ladder.svg)

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election (electoral college) | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| U.S. Senator | FPTP statewide election | 6 years (staggered) | 100 |
| U.S. Representative | Statewide multi-seat by vote share, or one election per district | 2 years | 435 |
| Governor | FPTP statewide election | 4 years | 1 per state (50) |
| State Senator | Multi-seat by vote share within the state | 4 years | 1,972 (varies per state) |
| Federal Reserve Chair | Appointed (in-game action) | 4 years | 1 |

A State Senator (+1 action per turn) who wins a governorship moves to +2 actions per turn, and a later Presidency is +4. The President's 4-year term is 192 turns (8 real days), a House term is 96 turns (4 real days), and a State Senator or Governor term is 192 turns. Plan the jump so that you are not stuck waiting: a House seat comes up every 4 real days, a Senate seat for your class every 12.

## Waiting for your Senate class

Only one-third of Senate seats are up per cycle (3 classes), so you may need to wait for your state's class to come up before running. Each class is up once every 288 turns (6 game years, 12 real days), with a class coming up every 96 turns (4 real days).

\`\`\`senate-classes
\`\`\`

## How a race is won

The Senate and governorships use **First Past the Post (FPTP)**: the most votes wins. There is no proportional representation for those offices.

House and State Senate races are different. Where a state elects several members at once, seats are shared out by vote share (the Hare largest remainder method), and a party must clear a minimum share of the state's pooled vote to win any. For the House that gate is 1 divided by (seats + 1), never below 10% and never above 20%. In a state with 4 House seats the gate is 20%; with 9 or more it is 10%. State Senate races use a flat 10% gate. Where district-based House elections are in play, each district elects one member instead (see [House redistricting](/wiki/us-house-redistricting)).

The President is chosen by an indirect **electoral college**, not a national popular vote: each state casts its electoral votes as a block, so win a state, win its electoral votes.

Primaries come first, and only one candidate per party advances to the general. In a multi-candidate primary, vote-splitting between similar candidates is a real risk: the spoiler effect applies. See [Primaries](/wiki/primaries) and [Election Mechanics](/wiki/election-mechanics) for the full rules, and [Campaign Strategy](/wiki/campaign-strategy) for fundraising, ads and canvassing.

## Governing: divided government, vetoes and the Fed

There are no confidence votes, no government formation and no snap elections. Once elected, the President governs for four years whichever party controls Congress, so **divided government is common**: one party holds the White House while the other controls one or both chambers.

- **Congress** is two chambers. The Senate (100 seats, six-year staggered terms) confirms federal judges, cabinet members and the Federal Reserve Chair. The House (435 seats, two-year terms, all contested each cycle) originates all revenue bills.
- **Bills** need both chambers and the President's signature. A veto opens a **24-hour** override vote, and the bill is enacted only if two-thirds of **all seats** in **both** the House and the Senate vote to override. Vacancies and abstentions do not lower the bar. See [Bills and Legislation](/wiki/bills-legislation).
- **The Cabinet** is the President's to fill; see the [Cabinet Guide](/wiki/cabinet-guide) for every post, its metrics and its actions.
- **State Senators** vote on state-level legislation, and bills passed at the state level have regional policy effects.
- **Founding a third party** means drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. Until all three sign, the party does not materialize. The charter system is the same in every country.

### The Federal Reserve Chair

The Fed's prime rate affects GDP growth, inflation and borrowing costs nationwide. The post is filled by presidential nomination and a Senate vote during a **24-hour** window, not by an election (see [Confirmation Process](/wiki/confirmation-process)). The Chair serves a 4-year term (192 turns) and can be reappointed. The Chair proposes each rate move, but the 7-seat committee votes on it, so the Chair alone cannot set the rate (see [FOMC / Rate-Setting Board](/wiki/fomc)).

| Item | Detail |
| --- | --- |
| Currency | USD |
| Central Bank | Federal Reserve ("Fed") |
| Chair title | Federal Reserve Chair |
| Default prime rate | 3.0% |
| Stock exchange | NYSE |

The US dollar is the global reserve currency in-game, so the Fed's prime rate influences borrowing costs for corporations and bonds across all countries, not just the US.

## Living history

The timeline below is written by the turn processor whenever a head-of-state transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
US
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Applies in every era and world. Last checked 2026-10-29, version 1.18.0.
`;
