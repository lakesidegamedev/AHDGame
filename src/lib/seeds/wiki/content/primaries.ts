export const primariesContent = `# Primaries

You cannot win the general election until you have won your own party's nomination, and the window to enter is short. Miss the declaration deadline and you wait a full cycle. Down-ballot primaries (House, Senate, Governor and the like) are decided by real primary ballots counted over the closing stretch of the primary. Presidential primaries hand out pledged delegates state by state. For the overall election structure see [Election Mechanics](/wiki/election-mechanics).

## Following one primary from spawn to nominee

1. **A cycle spawns** and the primary phase opens.
2. **You declare** during the window. It closes at the primary deadline: 72 turns after spawn for a regular US House race, 264 turns for a Senate race. After that no new candidacies are accepted.
3. **Standings are scored every turn** with your primary score (below).
4. **Ballots start counting in the closing stretch**, a window as long as the race's own general election (24 turns for standard elections). A Senate seat that sits in its primary for 264 turns does not cast ballots until the last 24. Each turn of that window, each party's registered voters release a slice of ballots, paced by the same closing-surge curve the general uses, and the slice is split between that party's candidates by a softmax of their scores that turn, which magnifies a lead: a few points of score become a much larger share of the ballots. Independents and unregistered voters cast no primary ballot.
5. **At the deadline the cumulative count decides.** The party's top vote-getter advances and the others are marked withdrawn. Where a party has no registered voters on file, the highest score wins instead.
6. **The winner moves into the general.** Losers get a notification, and a general-phase tally is set up for the election.

Why ballots accumulate: a sustained lead should beat a last-turn surge, and a late entrant faces a fair field.

![Primary timeline from spawn through the declaration window and the closing stretch where ballots count to the deadline, where the cumulative count decides.](/wiki-images/diagrams/primaries-timeline.svg)

### The numbers to plan around

| Item | Value |
| --- | --- |
| Primary length, regular US House | 72 turns |
| Primary length, regular US Senate | 264 turns |
| Ballot window | As long as the race's general election (24 turns) |
| State score: alignment with the state | 25 points |
| State score: alignment with the party | 15 points |
| State score: favorability | 35 points |
| State score: political influence | 25 points |
| Infamy penalty | Up to 5% of the score, at infamy 100 |
| NPP score when a player is in the primary | Halved (0.5x) |
| Quick Poll | 2 actions plus ₳25,000 |
| Presidential score: party alignment / party influence / national reach / favorability | 40 / 20 / 15 / 25 |
| Democratic delegate viability threshold | 15% |

### The state primary score

Your score is your standing within the party, from 0 to 100. It sets your share of each turn's ballots, through the softmax described above.

\`\`\`wiki-chart
state-primary-score-curves
\`\`\`

| Part | Max | How it is scored |
| --- | --- | --- |
| Alignment with the state | 25 | You lose 1.25 points for each point of econ and social distance from the state's lean |
| Alignment with the party | 15 | You lose 0.75 points for each point of distance from your party's platform |
| Favorability | 35 | Favorability x 0.35. Favorability 50 is worth 17.5 points; 80 is worth 28 |
| Political influence | 25 | A square-root curve that caps at 100. Influence 100 scores 25, 85 about 23, 50 about 17.7, 20 about 11.2 |

The result is then cut by up to 5% for infamy. State match is the larger alignment factor, so a candidate who fits the state beats a perfect partisan who is out of step with it. If a state has no stored lean, scoring falls back to a single 40-point party check.

**A close House primary.** Three candidates in a House primary score 71, 64 and 50. The softmax turns that into 67.1%, 28.0% and 4.9% of each turn's ballots. Suppose the middle candidate works hard and jumps to 80 for the last 4 turns, taking 74.2% of those turns. The 24-turn window's first 20 turns carry 70% of the ballots and the last 4 carry 30%. Cumulative result: 54.2%, 41.8% and 3.9%. The leader still wins, because a late surge only moves 30% of the pool. Even a jump to 95 leaves the leader ahead by a hair, 48.4% to 48.1%; only a score of 98 or more flips it. Long leads win primaries.

### The presidential primary

Presidential primaries are national and are won with **pledged delegates**, not ballots. Six waves of states vote (Iowa, New Hampshire, Nevada and South Carolina, Super Tuesday, mid-March, then everyone else). Each state's delegate pool is the 2020 table rescaled to the era's electoral votes: 3,889 Democratic delegates (1,945 needed) and 2,490 Republican delegates (1,246 needed) for the modern roster. Democratic states split delegates proportionally with a 15% viability threshold. Republican states use winner take all or proportional allocation, as their state chair sets it. In races on the reworked rules (1964 onward), if nobody holds a majority after the waves, a [convention](/wiki/nominating-convention) settles it.

With no delegates yet, the national sum of state primary votes ranks the field. Only with no votes either does the fallback score rank it, weighting party alignment 40, party influence 20, national reach 15 and favorability 25. Party chairs get no special multiplier in presidential primaries. A chair only comes out ahead as far as holding the post builds party influence faster. That is the usual reason a chair loses a presidential primary: alignment and favorability are worth 65 points together against 20 for party influence.

Build Campaign Presence state by state to raise your vote weight (up to +25% in the primary). See [Political Operations](/wiki/political-operations). The delegates you win here feed the [Nominating Convention](/wiki/nominating-convention), and the winner of either kind of primary becomes the party's nominee in the [General Elections](/wiki/general-elections).

### Computer-run candidates

NPPs (non-player politicians), covered in [NPP Elections](/wiki/npp-elections), enter primaries automatically. They never enter a presidential primary in a country with players. Entry runs in this order:

1. **Incumbent defense.** A sitting NPP officeholder always files in its own seat's primary, whoever else is running.
2. **Party slate.** An NPP that a party chair slated files where it was slated, even into a primary the party already has a candidate in.
3. **Generic fill.** Otherwise an NPP files only where its party has no active candidate yet, so generic fill adds at most one per party.
4. **Challengers.** Where NPP autonomy is high enough, a primary with exactly one candidate in a party can draw one extra NPP challenger on a seeded roll. A player candidate is challenged at most once per election.

When a player is in the same party's primary, the NPP's score is halved. A 60-point NPP scores 30 against you, and a player scoring 75 (alignment 35, favorability 25, influence 15) beats a raw 80 NPP who scores an effective 40. NPPs have no infamy penalty. A slated NPP from the [Party Slate](/wiki/party-slate) can join a primary and make it contested. Once entered they stay until the primary resolves, except that in a primary with no player in it, a non-incumbent NPP below 60% of its party leader's strength may withdraw in the last 12 turns. Primaries with a player in them never see these withdrawals.

## Declaring, polling and tactics

- **Declare** during the window, from the race page (Nation > Elections). You need party membership at the moment you declare. You can join a party after spawn and before the deadline. Only one active candidacy at a time.
- **Switch parties** by declaring under the new party. Your old candidacy is withdrawn automatically and your campaign moves across.
- **Poll first.** A Quick Poll shows your topline appeal and your five best and worst groups. See [Polling](/wiki/polling).
- **Campaign** from the Campaign Manager page to raise influence and favorability. See [Campaign Manager](/wiki/campaign-manager).
- **Withdraw** if you must. It is final: you cannot re-enter that election, and withdrawing mid-primary is almost always a mistake. If you are losing, just lose. Your influence and favorability persist into the next cycle.

Tips:

- **Alignment first.** Every point you sit from your party's platform costs 0.75 points of score, and every point from the state's lean costs 1.25. The party page shows the official positions. Party platforms are covered in [Political Parties](/wiki/political-parties), and [Party Ideology](/wiki/party-ideology) explains how alignment with the party and the state is worth up to 40 primary points.
- **Do not attack fellow party members.** The winner should face the general at full strength.
- **Start early.** Influence decays only 0.75% of its value per turn (up to twice that if your party holds the national executive), so campaigning early compounds, and ballots reward a lead held through the whole window.
- **Value favorability.** It is 35 of the 100 points. Favorability 80 against 50 is an 11 point swing.
- **Check the field.** An NPP-only seat is a good target, and a crowded race where you are fourth in alignment is not.

Live in every world and country with party primaries. Presidential delegate waves apply to the US presidency; races that opened under the older rules (the 1960 race and unstamped races) run all six waves compressed into the final 6 turns, and from 1964 onward the waves are spaced 8 turns apart over the last 41 turns. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html). See also [Primary vs General Tactics](/wiki/primary-general-tactics).
`;
