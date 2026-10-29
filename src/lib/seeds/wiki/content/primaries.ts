export const primariesContent = `# Primaries

A primary is a contest inside your own party for its nomination. Win it and you face the other parties' nominees in the general election. Down-ballot primaries (House, Senate, Governor and the like) are decided by real primary ballots counted over the closing stretch of the primary. Presidential primaries hand out pledged delegates state by state. Miss the declaration window and you wait a full cycle, so it pays to know the rules before you file.

This page covers declaring, scoring, computer-run candidates (NPPs) and tactics. For the overall election structure see [Election Mechanics](/wiki/election-mechanics).

## How it works

1. **A cycle spawns** and the primary phase opens.
2. **You declare** during the window. It closes at the primary deadline: 48 hours after spawn for a US House race, 240 hours for a Senate race. After that no new candidacies are accepted.
3. **Standings are scored every turn** with your primary score (below).
4. **Ballots start counting in the closing stretch**, a window as long as the race's own general election (24 turns for every election). A Senate seat that sits in its primary for 264 turns does not cast ballots until the last 24. Each turn of that window, each party's registered voters release a slice of ballots, paced by the same closing-surge curve the general uses, and the slice is split between that party's candidates in proportion to their score that turn. Independents and unregistered voters cast no primary ballot.
5. **At the deadline the cumulative count decides.** The party's top vote-getter advances and the others are marked withdrawn. Where a party has no registered voters on file, the highest score wins instead.
6. **The winner moves into the general.** Losers get a notification, and a general-phase tally is set up for the election.

Why ballots accumulate: a sustained lead should beat a last-turn surge, and a late entrant faces a fair field.

### Key numbers

| Item | Value |
| --- | --- |
| Primary deadline, US House | 48 hours after spawn |
| Primary deadline, US Senate | 240 hours after spawn |
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

Your score is your standing within the party, from 0 to 100. It sets your share of each turn's ballots.

| Part | Max | How it is scored |
| --- | --- | --- |
| Alignment with the state | 25 | You lose 1.25 points for each point of econ and social distance from the state's lean |
| Alignment with the party | 15 | You lose 0.75 points for each point of distance from your party's platform |
| Favorability | 35 | Favorability x 0.35. Favorability 50 is worth 17.5 points; 80 is worth 28 |
| Political influence | 25 | A square-root curve that caps at 100. Influence 100 scores 25, 85 about 23, 50 about 17.7, 20 about 11.2 |

The result is then cut by up to 5% for infamy. State match is the larger alignment factor, so a candidate who fits the state beats a perfect partisan who is out of step with it. If a state has no stored lean, scoring falls back to a single 40-point party check.

**Worked example.** Three candidates in a House primary score 71, 64 and 50. Their share of each turn's ballots is 71 / 185 = 38.4%, 34.6% and 27.0%. Suppose the middle candidate works hard and jumps to 80 for the last 4 turns. The first 44 turns carry 70% of the ballots and the last 4 carry 30%. Cumulative result: 37.5%, 36.2% and 26.4%. The leader still wins, because a late surge only moves 30% of the pool. If the challenger had jumped to 90 instead, the race would have flipped by a hair. Long leads win primaries.

### The presidential primary

Presidential primaries are national and are won with **pledged delegates**, not ballots. Six waves of states vote (Iowa, New Hampshire, Nevada and South Carolina, Super Tuesday, mid-March, then everyone else). Each state's delegate pool is the 2020 table rescaled to the era's electoral votes: 3,889 Democratic delegates (1,945 needed) and 2,490 Republican delegates (1,246 needed) for the modern roster. Democratic states split delegates proportionally with a 15% viability threshold. Republican states use winner take all or proportional allocation, as their state chair sets it. If nobody holds a majority after the waves, a [convention](/wiki/nominating-convention) settles it.

The national ranking used when there is no delegate data weights party alignment 40, party influence 20, national reach 15 and favorability 25. Party chairs get no special multiplier in presidential primaries. A chair only comes out ahead as far as holding the post builds party influence faster. That is the usual reason a chair loses a presidential primary: alignment and favorability are worth 65 points together against 20 for party influence.

Build Campaign Presence state by state to raise your vote weight (up to +25% in the primary). See [Political Operations](/wiki/political-operations).

### NPP primary candidates

NPPs (non-player politicians) enter primaries automatically, and entry is deterministic:

1. **Incumbent defense.** A sitting NPP officeholder always enters if the party has no player candidate.
2. **Slate fill.** Each party tries to field at least one NPP in every open race, empty primaries first.
3. **One generic NPP.** After that, at most one more NPP per party may enter if no player is present.

When a player is in the same party's primary, the NPP's score is halved. A 60-point NPP scores 30 against you, and a player scoring 75 (alignment 35, favorability 25, influence 15) beats a raw 80 NPP who scores an effective 40. NPPs have no infamy penalty. Once entered they stay until the primary resolves, except that in a primary with no player in it a clearly trailing NPP may withdraw late and a challenger may be drawn from the party's strongest NPPs. Primaries with a player in them are never affected.

## What you can do

- **Declare** during the window, from the race page (Nation > Elections). You need party membership at the moment you declare. You can join a party after spawn and before the deadline. Only one active candidacy at a time.
- **Switch parties** by declaring under the new party. Your old candidacy is withdrawn automatically and your campaign moves across.
- **Poll first.** A Quick Poll shows your topline appeal and your five best and worst groups. See [Polling](/wiki/polling).
- **Campaign** from the Campaign Manager page to raise influence and favorability. See [Campaign Manager](/wiki/campaign-manager).
- **Withdraw** if you must. It is final: you cannot re-enter that election, and withdrawing mid-primary is almost always a mistake. If you are losing, just lose. Your influence, favorability and donor base persist into the next cycle.

Tips:

- **Alignment first.** Every point you sit from your party's platform costs 0.75 points of score, and every point from the state's lean costs 1.25. The party page shows the official positions.
- **Do not attack fellow party members.** The winner should face the general at full strength.
- **Start early.** Influence decays only 0.75% of its value per turn, so campaigning early compounds, and ballots reward a lead held through the whole window.
- **Value favorability.** It is 35 of the 100 points. Favorability 80 against 50 is an 11 point swing.
- **Check the field.** An NPP-only seat is a good target, and a crowded race where you are fourth in alignment is not.

## Connections

**Driven by**

- [Election Mechanics](/wiki/election-mechanics): sets the phases, windows and closing-surge pacing.
- [Political Operations](/wiki/political-operations): Campaign Presence adds up to 25% vote weight in presidential primaries.
- [Campaign Manager](/wiki/campaign-manager): campaign actions raise the influence and favorability that make up your score.
- [Polling](/wiki/polling): a Quick Poll tells you whether to enter and where you stand.
- [Political Parties](/wiki/political-parties): the party platform sets the alignment half of your score.
- [party-ideology](/wiki/party-ideology): Party Ideology: alignment with the party and the state is worth up to 40 primary points.
- [npp-elections](/wiki/npp-elections): NPP Elections: NPP candidates fill primary fields and score at half when a player is in the same primary.

**Affects**

- [Nominating Convention](/wiki/nominating-convention): presidential delegates won here feed the convention.
- [General Elections](/wiki/general-elections): the winner becomes the party's nominee in the general.

## Status

Live in every world and country with party primaries. Presidential delegate waves apply to the US presidency; races that opened under the older rules (the 1960 race and unstamped races) run all six waves compressed into the final 6 turns, and 1964 onward stretch them across the primary.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact scoring weights and ballot pacing are on the [Elections design page](https://docs.lakesidegames.net/design/elections.html). See also [NPP Elections](/wiki/npp-elections), [Primary vs General Tactics](/wiki/primary-general-tactics).
`;
