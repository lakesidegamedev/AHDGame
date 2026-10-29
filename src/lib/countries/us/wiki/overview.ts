export const usOverviewContent = `# United States

The United States is a **federal presidential republic**. It has 50 states, a bicameral Congress, a directly elected President who serves as both head of state and head of government, and sub-national elected offices at the state level.

---

## Government structure

| Office | How Filled | Term | Seats |
| --- | --- | --- | --- |
| President | Direct election (electoral college) | 4 years | 1 |
| Vice President | Elected on presidential ticket | 4 years | 1 |
| U.S. Senator | FPTP statewide election | 6 years (staggered) | 100 |
| U.S. Representative | Statewide multi-seat by vote share, or one election per district | 2 years | 435 |
| Governor | FPTP statewide election | 4 years | 1 per state (50) |
| State Senator | Multi-seat by vote share within the state | 4 years | 1,972 (varies per state) |
| Federal Reserve Chair | Appointed (in-game action) | 4 years | 1 |

The Federal Reserve Chair is a player-appointable position. The President nominates, and sitting Senators vote on the nomination during a **24-hour** window (see [Confirmation Process](/wiki/confirmation-process)). The chair serves a 4-year term (192 turns) and can be reappointed. The Chair alone cannot move the rate: the 7-seat committee votes on it (see [FOMC / Rate-Setting Board](/wiki/fomc)).

The **Congress** consists of two chambers:

- **U.S. Senate**: 100 seats, six-year staggered terms (one-third of seats contested per cycle, split across 3 classes). Senators confirm federal judges, cabinet members, and the Federal Reserve Chair.
- **U.S. House of Representatives**: 435 seats, two-year terms. All revenue bills originate in the House. All seats are contested each election cycle.

---

## Electoral system

The US uses **First Past the Post (FPTP)**, meaning the most votes wins, for the Senate and for governors. There is no proportional representation for those offices.

House and State Senate races are different. Where a state elects several members at once, seats are shared out by vote share (the Hare largest remainder method), and a party must clear a minimum share of the state's pooled vote to win any. For the House that gate is 1 divided by (seats + 1), never below 10% and never above 20%. In a state with 4 House seats the gate is 20%; with 9 or more it is 10%. State Senate races use a flat 10% gate. Where district-based House elections are in play, each district elects one member instead (see [House redistricting](/wiki/us-house-redistricting)).

**Presidential elections** use an indirect electoral college. The President is not chosen by national popular vote; each state casts electoral votes as a block. Win a state, win its electoral votes.

**Primaries** are held before general elections. Only one candidate from each party advances from a primary to the general. In a multi-candidate primary, vote-splitting between similar candidates is a real risk: the spoiler effect applies.

---

## Career path for US players

Most players start at the state level. The typical ladder:

1. **State Senator**: Cheapest race to enter. Builds favorability and Political Influence in your home state.
2. **Governor** or **U.S. Representative**: Either a sub-national executive role or a step into federal legislature.
3. **U.S. Senator**: Longer terms, more actions per turn (+2), and confirms federal appointments.
4. **President**: Top of the ladder. +4 actions per turn. Serves as both head of state and head of government. No coalition required.

![Career ladder from State Senator through Governor or Representative and Senator to President, with the extra actions per turn at each rung.](/wiki-images/diagrams/us-overview-career-ladder.svg)

**Worked example.** A State Senator (+1 action per turn) who wins a governorship moves to +2 actions per turn, and a later Presidency is +4. The President's 4-year term is 192 turns (8 real days), a House term is 96 turns (4 real days), and a State Senator or Governor term is 192 turns. Plan the jump so that you are not stuck waiting: a House seat comes up every 4 real days, a Senate seat for your class every 12.

**Which office should I start from?** State Senator. It is the cheapest race and builds the favorability and Political Influence you need for everything above it. See [Player Progression](/wiki/player-progression).

There is no parliamentary confidence vote in the US. The President cannot be removed by Congress mid-term through a standard vote: the executive is fixed for four years regardless of which party controls Congress.

---

## Key US mechanics

**No coalition government.** The President is directly elected and serves a fixed four-year term. There are no confidence votes, no government formation process, and no snap elections. Once elected, the President governs regardless of congressional composition.

**Divided government is common.** One party can hold the presidency while the other controls one or both chambers. Bills require passage in both chambers and presidential signature. A President can veto legislation. A veto opens a **24-hour** override vote, and the bill is enacted only if two-thirds of **all seats** in **both** the House and the Senate vote to override. Vacancies and abstentions do not lower the bar. See [Bills and Legislation](/wiki/bills-legislation).

**Federal Reserve Chair.** The Fed's prime rate affects GDP growth, inflation, and borrowing costs nationwide. The Chair proposes each rate move and the FOMC committee votes it through, so the Chair alone cannot set the rate. The post is filled by presidential nomination and a Senate vote, not by an election.

**Party creation routes through a charter.** Founding a new third party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. Until all three sign, the party doesn't materialize. The charter system is the same in every country.

**Staggered Senate.** Only one-third of Senate seats are up per cycle (3 classes), so you may need to wait for your state's class to come up before running. Each class is up once every 288 turns (6 game years, 12 real days), with a class coming up every 96 turns (4 real days).

\`\`\`senate-classes
\`\`\`

**State Senators.** In addition to federal offices, each state has its own State Senate. State senators earn +1 action per turn and vote on state-level legislation. Bills passed at the state level have regional policy effects.

---

## Currency and economy

| Item | Detail |
| --- | --- |
| Currency | USD |
| Central Bank | Federal Reserve ("Fed") |
| Chair title | Federal Reserve Chair |
| Default prime rate | 3.0% |
| Stock exchange | NYSE |

The US dollar is the global reserve currency in-game. The Fed's prime rate influences borrowing costs for corporations and bonds across all countries, not just the US.

---

## Key US links

- [Cabinet Guide](/wiki/cabinet-guide): every cabinet post, its metrics, and its actions
- [Election Mechanics](/wiki/election-mechanics): Primary and general election rules
- [Primaries](/wiki/primaries): How US primaries work and spoiler effect
- [Federal Reserve committee](/wiki/fomc): the 7-seat board that votes on rate moves
- [Confirmation Process](/wiki/confirmation-process): how the Senate confirms the Fed Chair and cabinet
- [House redistricting](/wiki/us-house-redistricting): how House districts are drawn
- [Bills and Legislation](/wiki/bills-legislation): signing, vetoes and overrides
- [Campaign Strategy](/wiki/campaign-strategy): Fundraising, ads, canvassing
- [Core Systems](/wiki/core-systems): Turn structure, action economy
- [Player Progression](/wiki/player-progression): Career ladder details

---

**Status:** the United States is playable in every era and world. Last checked: 2026-10-29, version 1.18.0.

---

## Living history

The timeline below is written by the turn processor whenever a head-of-state transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
US
\`\`\`
`;
