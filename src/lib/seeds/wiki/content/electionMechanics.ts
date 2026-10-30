export const electionMechanicsContent = `# Election Mechanics

No office in A House Divided ever sits empty for long. Every seat runs on a continuous cycle: one election resolves and the next spawns at once. If you want a seat, the question is never whether an election is coming, but which phase you can still enter and what wins it. This page covers the phases, the timing, what makes votes, and the special rules, so you can plan around them. For a tour of the screens, read the [Elections player guide](/wiki/elections-player-guide).

## Two phases, one seat

Every election has two phases.

1. **Primary phase.** Candidates from the same party compete for one nomination.
   - **Down-ballot races** (House, Senate, Governor, State Senate and their equivalents abroad) count real primary ballots. Over the closing stretch of the primary, each party's registered voters release a slice of ballots every turn, split between that party's candidates by their standing that turn. The cumulative count names the nominee, so a sustained lead beats a late surge. See [Primaries](/wiki/primaries).
   - **Presidential** primaries run staggered state voting that hands out pledged delegates. The delegate leader is nominated; in races on the reworked rules (1964 onward) a [convention](/wiki/nominating-convention) settles it if nobody holds a majority.
2. **General phase.** Nominees from different parties compete. Votes accumulate turn by turn, and the final 4 turns carry 30% of the pool. Only registered voters cast general ballots, and a race can never certify more ballots than it has voters. See [General Elections](/wiki/general-elections).

When the general resolves, winners take office and the next cycle spawns.

![Election lifecycle from spawn through declaration, primary, general and resolution to the next cycle spawning.](/wiki-images/diagrams/election-mechanics-lifecycle.svg)

### The numbers to plan around

| Item | Value |
| --- | --- |
| General pool, early band | 50% spread over every turn before the ramp |
| General pool, ramp band | 20% over the 8 turns before the final band |
| General pool, final band | 30% over the last 4 turns |
| Races of 4 turns or fewer | pool spread evenly |
| State race approval modifier (ballots cast per turn) | 0.9x at 0% approval, 1.0x at 50%, 1.1x at 100% |
| Presidential approval modifier (ballots cast per turn) | 0.75x at 0%, 1.0x at 50%, 1.25x at 100% |
| Office strength | Governor 1.0, President 1.0, House 0.9, State Senate 0.85, Senate 0.8 |
| NPP weight in a general with a player | 0.8x |
| NPP score in a primary with a player in it | 0.5x |
| Spoiler bleed to a third party | 4% (2% in presidential races) |
| Independent presidential candidate | 0.3x vote share |
| Tenure erosion on influence and favorability | 3% per consecutive term after the first, max 15% |
| National Mood clamp | plus or minus 8 points of national vote share |
| Contingent election | House votes by state delegation, Senate picks the Vice President |

### How long races last (US)

Durations are in real hours, and one real hour is one game week.

| Office | Total | Primary | General |
| --- | --- | --- | --- |
| House | 96h (2 game years) | 72h | 24h |
| Senate | 288h (6 game years) | 264h | 24h |
| Governor | 192h (4 game years) | 168h | 24h |
| State Senate | 192h (4 game years) | 168h | 24h |
| President | 192h (4 game years) | 168h | 24h |

Senate seats are split into three classes per state, staggered about a third of the cycle apart, so one third of the Senate is up at any time. The UK, Germany and Japan use different cycle lengths; see each country hub.

### The primary score (state races)

The score is a candidate's standing in their own party's primary. It sets how each turn's slice of ballots is split, and it decides the race outright where a party has no registered voters on file.

| Part | Points | What it rewards |
| --- | --- | --- |
| Alignment with the state | 0 to 25 | Matching the state's politics (lose 1.25 points per point of econ and social distance) |
| Alignment with the party | 0 to 15 | Matching the party platform (lose 0.75 per point of distance) |
| Favorability | 0 to 35 | Favorability / 100 x 35 |
| Influence | 0 to 25 | The square root of your political influence, so the first points count most |

A final infamy penalty cuts the total by 5% at infamy 100. NPP candidates (computer-run politicians) get half score when a player is in the same party's primary, and no infamy penalty. Presidential nominations are decided by delegates instead. With no delegates yet, the national sum of state primary votes decides; only when there are no recorded votes either does the fallback score rank them, weighting party alignment 40, party influence 20, national reach 15 and favorability 25.

Presidential primary states vote in six waves modelled on the 2020 calendar: Iowa, New Hampshire, Nevada and South Carolina, a 14-state Super Tuesday, mid-March, then everyone left. Races from 1964 onward space the waves 8 turns apart over the last 41 turns of the primary, and older races squeeze them into the last 6 turns.

### How general votes are built

Each turn, a pool of votes is split between groups of voters (see [Demographics](/wiki/demographics)) in proportion to their size. Inside each group, candidates share that group's slice by relative weight, which multiplies these parts:

- **Reach:** the square root of your political influence, capped at 1.0 when influence hits 100. Even at influence 0 you keep a floor of 0.1, so a new character is weak and never erased.
- **Appeal:** how close your positions are to the group's. A perfect match is worth about 25.5 points, and agreeing in direction on both axes adds up to 10 more. Each point of distance costs 5.
- **Approval:** your favorability (plus half of the group's approval of you), raised to the 0.8 power. At 0% you get no votes.
- **Party organization:** your party's share of the state's organization, raised to the 0.2 power. A 3 to 1 organization lead is only worth about 1.25 to 1 in votes. A candidate with no organization still gets a small floor from personal pull.
- **Infamy:** up to 5% off for player characters with high infamy.
- **Voter mood and loyalty:** registration makes a party's own voters 1.0x to 1.3x harder to persuade away, and short-term support moves your swing between 0.6x and 1.4x.

\`\`\`wiki-chart
general-election-vote-pool
\`\`\`

Influence is not part of appeal. It enters only through reach.

**A single group, turn by turn.** One group has 10,000 votes this turn, with two candidates and no direction bonus. Candidate A is 2 econ and 1 social points from the group (appeal 15.1), has influence 49 (reach 0.70), effective favorability 80 (approval 0.84) and 60% of the state's party organization (0.90). Weight: 15.1 x 0.70 x 0.84 x 0.90 = 8.0. Candidate B is 3 and 2 points away (appeal 9.3), has reach 0.80, effective favorability 75 (0.79) and 40% of the organization (0.83): 9.3 x 0.80 x 0.79 x 0.83 = 4.9.

A takes 8.0 / 12.9 = 62% of the group, or about 6,180 of 10,000 votes. In a 24-turn general with a 100,000 vote pool, each final-band turn releases 7,500 votes against about 4,167 in the early band (50% over 12 turns), so the same advantage is worth 1.8 times as much.

**Why the closing surge exists.** It keeps races live until the end and rewards players who are still active. The same curve paces the primary ballot count over its closing window.

### Third parties and spoilers

Most states use first past the post. A third-party candidate draws 4% of their group votes from the nearest major-party candidate (2% in presidential races, adjusted for who has more organization in the state). A Green candidate bleeds Democrats, which can hand a seat to the Republican. Ranked choice states have no spoiler effect; changing a state's voting system needs legislation.

### National Mood

Presidential races also score the economy as a referendum on the party in the White House. It shows as the National Mood card on the race page.

| Input | Counts when | Points per unit | Cap |
| --- | --- | --- | --- |
| Unemployment | Away from 6% (above costs, below pays) | 0.6 per point | 4 |
| Poverty | Away from 20% (above costs, below pays) | 0.15 per point | 3 |
| Inflation | Outside a 3-point band centred on the era's inflation target (1% to 4% with no target), either way, penalty only | 0.4 per point | 3 |
| Real median income trend | Moves either way | 0.3 per point | 1.5 |

Unemployment, poverty and income are signed; inflation can only cost. A good economy pays the incumbent party a bonus of up to 4 points in total, a bad one charges a penalty, and the total is clamped to 8 points either way. Bills enacted in the last 24 turns that push a suffering input the right way cut the penalty by up to 40%, with diminishing credit for each extra bill. A party seeking a 3rd straight term wears a bad economy at 1.25x, and a 4th or later at 1.5x. Because the inputs are live national metrics, you can change the card by changing policy before the election. See [National Metrics](/wiki/national-metrics).

### Tenure and coattails

Holding a seat builds a personal edge, so the game scales your influence and favorability down by 3% for each consecutive term past the first, stopping at 15%. For Senate seats and House members it is your own run; for the presidency it is your party's run. A sitting executive's approval also lifts or drags their party in every down-ballot general below it (governor coattails at state level, presidential at national level).

### Multi-seat races

House, State Senate and other multi-seat contests allocate seats by the largest remainder method, in proportion to vote share. A party below the minimum share wins no seat. For the US House the minimum is 1 / (seats + 1), kept between 10% and 20%: 20% for delegations of up to 4 seats, 10% for 9 or more. State Senate races use 10%. In a 2-seat House race the winner takes both unless the runner-up reaches 20%.

### Presidential specifics

- **Campaign Presence** lets a candidate build vote weight state by state. See [Political Operations](/wiki/political-operations).
- **Electoral College.** You need a majority of the college the election actually used: 270 of 538 today, 266 of 531 in the 1950s. Maine and Nebraska split electors by congressional district.
- **Running mate.** After the primary each nominee picks a running mate (see [Running mate and surrogate](/wiki/running-mate-surrogate)). A nominee whose running mate is from the state gets +3% there.
- **Travel.** A candidate can travel to one state at a time in the general for +1 favorability per turn. The gain goes to your overall favorability, not just that state's. It costs 3 actions for a state with 5 or fewer electoral votes, 5 for up to 10, 7 for up to 20 and 10 above that.
- **Governor endorsement.** A sitting governor who endorses a candidate gives them 1.5% more votes in that governor's state.
- **Campaign strength.** Contributions add 0.75 x your national influence in strength, and the vote multiplier approaches a ceiling as strength grows (1 + bonus x (1 - exp(-strength / 50,000))). In races on the reworked rules (1964 onward) the bonus tops out at 25%, so the most it can add is 1.25x votes. Older races allow up to 2x. Each turn the strength leader is pulled back toward the race average by up to 175.
- **Ground game.** Swing canvassing adds votes in close states (lean under 0.5), and get-out-the-vote adds votes in every state.
- **Independents.** An independent presidential candidate keeps only 0.3x of their general vote share.
- **Position blend.** In presidential generals candidate positions are blended 75% candidate, 25% party.
- **Closing-period tactical voting.** In races on the reworked rules, 5% of the new ballots of candidates with no realistic chance in a state move to a viable candidate during the closing turns.
- **State lean.** Races on the older rules also tilt each state or district by at most 20% either way, so lean matters but never decides the race alone.

**No electoral majority.** If nobody reaches a majority, a contingent election runs: the House elects the President from the top three, one vote per state delegation (26 of 50 needed), and the Senate elects the Vice President from the top two running mates (51 of 100). If the House stays deadlocked, the Senate's Vice President choice serves as acting president and the House re-votes every turn for up to 24 turns. See [Contingent Election](/wiki/contingent-election).

**Suspend and endorse.** In a presidential general, a nominee can suspend their campaign and endorse another nominee, from the Campaign Manager page. You stay on the ballot and keep the votes already earned, but you gain no more and forfeit passive bonuses. A share of your campaign strength moves to your endorsed nominee (about a quarter if well aligned, much less if not), and up to 25% of your personal state organization is added to theirs, scaled by how well aligned you are. It cannot be undone.

## Entering and leaving a race

- **Declare** for one office in your home state or region (President is national). Your home country must match the election's country.
- **Pick a party.** Independents run in the independent party primary under the same rules.
- **Withdraw** any time before the election resolves. Your votes are removed for good, your campaign is archived and you cannot re-enter that election. During a primary this is almost always wrong; during a general you are losing it can free your actions for the next cycle.
- **Campaign** from the Campaign Manager page (see [Campaign Manager](/wiki/campaign-manager)).
- **Build presence, travel, suspend or endorse** in presidential races, as described above.

You can only run in one race at a time. Declarations close when the primary window ends, and if you miss it you wait a full cycle.

Common questions:

- **Why did I win the primary and lose the general?** The primary is a vote among one party's registered voters, scored on alignment with them. The general is everyone, scored on alignment with each voter group, and party organization counts, which is neutral in a primary. See [Primary vs General Tactics](/wiki/primary-general-tactics).
- **Can I influence National Mood?** Yes, through the economy and bills that fix it, before election day.

## What feeds the vote, and what it feeds

The size and positions of voter groups, from [Demographics](/wiki/demographics), set how each turn's pool splits. [Government Approval](/wiki/government-approval) scales how many ballots each state casts per turn, for every candidate alike, so it changes turnout rather than shares, and [National Metrics](/wiki/national-metrics) (unemployment, poverty, inflation and income) set National Mood. Your own side of it comes from [Political Operations](/wiki/political-operations), where Campaign Presence raises vote weight in presidential races, from the actions and strength you build in the [Campaign Manager](/wiki/campaign-manager), and from the money in [Fundraising and Ads](/wiki/fundraising-ads) that pays for them. [Stats & Actions](/wiki/stats-actions) explains where PI, NPI and Favorability, which feed vote reach, appeal and primary scores, come from.

The calendar around the vote matters too. [Core Systems](/wiki/core-systems) is where turns count the ballots and term lengths set the cycle, and [the game loop](/wiki/the-game-loop) shows when the primary and general windows and the vote-weight curve make timing decisive. A move through [Relocation](/wiki/relocation) withdraws open candidacies and vacates seats, which spawn new races. A [snap election](/wiki/snap-elections) resets the next regular election date and runs on the same rules. A passing independence vote in [Referendums](/wiki/referendums) stands up new elections, and [US House Redistricting](/wiki/us-house-redistricting) draws the district maps that decide which House seats are close.

Going the other way, this page sets the phases and scoring that [Primaries](/wiki/primaries) follow and the vote accumulation each of [General Elections](/wiki/general-elections) uses. [Polling](/wiki/polling) reuses the same vote model for state races, and the [Vote Factor Ledger](/wiki/vote-factor-ledger) breaks that model into its factors. Winners take office and shift party strength in [Political Parties](/wiki/political-parties), and [Player Progression](/wiki/player-progression) is built on winning a primary and general to get each office. Election night's vote totals appear in [live election results](/wiki/live-election-results). A presidential race with no electoral majority starts the [contingent election](/wiki/contingent-election), whose House or Senate result replaces the Electoral College winner.

Live in every world that has elections, for every playable country. Cycle lengths and some details differ by country (see each country hub). Presidential details apply to the US, and district-by-district House races only where redistricting is in play. US presidential races from 1964 onward use the reworked rules (stretched primary calendar, conventions, affinity-based suspend transfers, tactical voting); older races such as 1960 use the original rules. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html). See also [Reference: Formulas](/wiki/reference-formulas).
`;
