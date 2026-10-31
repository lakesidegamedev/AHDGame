export const generalElectionsContent = `# General Elections

A candidate can lead a general election for 21 of its 25 counting turns and still lose it. Votes accumulate over the whole window rather than in one tally, and the final 4 turns carry 30% of the pool, so the closing week decides more than its length suggests. This page covers what happens between the end of the primary and the result. For the overall structure see [Election Mechanics](/wiki/election-mechanics), and for the phase before this one see [Primaries](/wiki/primaries). Primary winners become the nominees, and for the presidency the [Nominating Convention](/wiki/nominating-convention) names them.

## Where the votes come from

Each election has a total vote pool built from the state's demographics: voter groups with a size, a turnout rate and positions on the economic and social axes (see [Demographics](/wiki/demographics)). [Canvassing](/wiki/canvassing) changes how many ballots each group casts. Only the **registered** share of the electorate casts general ballots. The pool is conserved across every turn of the count, and a race can never certify more ballots than it has voters.

\`\`\`wiki-chart
general-election-vote-pool
\`\`\`

### Three bands of counting

The pool is released over the general window in three bands:

| Turn phase | Share of pool | Per-turn weight |
| --- | --- | --- |
| Early turns | 50% | Spread evenly across the early band |
| Ramp (8 turns before the final band) | 20% | Spread evenly across the ramp |
| Election day (final 4 turns) | 30% | 0.3 x pool / 4 per turn |

The general phase is 24 turns for every election type, and the turn the race closes on also counts, so the pool is spread over 25 counting turns. That gives 13 early turns at about 3.85% of the pool each, 8 ramp turns at 2.5% each and 4 final turns at 7.5% each. A final turn is worth about 1.95 times an early turn.

**What the spike is worth.** A 10-point swing in your share held only during the final 4 turns moves your final share by 3.0 points (30% of the pool). The same swing held during the early band moves it by 5.0 points. A late dip in favorability or a stale influence on the last day can cost you a race you dominated for most of it.

### Building one turn's votes

The general uses the swing-flow model: the same per-group pipeline as [Election Mechanics](/wiki/election-mechanics) (reach, appeal, approval, party organization, infamy), plus registration resistance, a support mood factor and coattails. In presidential races it also adds the National Mood economic channel. The headline rules:

- Voter groups reward candidates whose positions are close to their centre ([Party Ideology](/wiki/party-ideology)). Influence does not feed appeal; it enters the vote only through reach.
- Approval is (favorability / 100) to the power 0.8, so 0% favorability means 0 votes.
- Party organization ([Party Organization](/wiki/party-organization)) is your party's share of the state's total, to the power 0.2. It applies in the general only. Primaries use a neutral 1x.
- Registration makes a party's own voters harder to peel away (1.0x to 1.3x). Short-term support scales your base share of each group between 0.6x and 1.4x, and a support lead over a rival also drives votes your way in the swing between parties.
- Player characters lose up to 5% of their weight at infamy 100.
- NPPs (computer-run candidates, see [NPP Elections](/wiki/npp-elections)) get an 0.8x weight in a general where at least one player is in the race.
- UK elections also weight each party by the square root of its current registration share. A party at 25 registration gets 0.5x, and a party at 100 gets 1.0x. A party can grow from zero without being erased.
- The whole turn pool is scaled by state government approval (see [Government Approval](/wiki/government-approval)) and office strength: Governor 1.0, President 1.0, House 0.9, State Senate 0.85, Senate 0.8.

\`\`\`wiki-chart
favorability-vote-scalar
\`\`\`

### The numbers to plan around

| Item | Value |
| --- | --- |
| General window | 24 turns |
| Early / ramp / final share of pool | 50% / 20% / 30% |
| Final band | last 4 turns, 7.5% of pool each |
| Registration resistance | 1.0x to 1.3x |
| Support mood | 0.6x to 1.4x |
| Infamy penalty | up to 5% |
| NPP weight in a player race | 0.8x |
| FPTP spoiler | 4% of a third party's group votes (2% in presidential races) |
| Canvassing when the race ends within 4 turns | 2x |
| Out-of-state action cost (Support and Attack) | 1.25x neighbour, 1.5x other |
| Full Demographic Poll | 6 actions, ₳75,000 base |
| Vice President | +2 actions per turn, +₳25,000 per turn |

### Third parties, spoilers and ranked choice

In first-past-the-post states (the default), a third-party candidate draws votes equal to 4% of their own vote from the ideologically nearest major-party candidate, measured on the econ and social grid. Major parties are regional: Democrat and Republican in the US, Labour and Conservative in England, SNP and Labour in Scotland, CDU and SPD in Germany, LDP and CDP in Japan. A strong Green costs the Democrat votes and a strong Libertarian costs the Republican, so major-party candidates should treat viable third parties as a threat in close races. In presidential races the rate is 2% and adjusted for who has more organization in the state.

Regions seeded with **ranked choice voting** (several European countries, such as Ireland and France, use it) get no spoiler adjustment in their own races. Third parties compete on level footing there. No legislation switches a region's voting system, and presidential races always apply the spoiler.

### Multi-seat races

US House, State Senate, UK Commons regions, Bundestag Land races and Shugiin seats use proportional allocation by the largest remainder method; the Bundestag then adds list seats nationally by Sainte-Lague above a 5% threshold. The minimum party share to win a seat in a US House race is 1 divided by (seats + 1), kept between 10% and 20%, so small delegations need 20% and delegations of 9 or more need 10%. State Senate and UK Commons regions use a flat 10%. In a 2-seat House race the winner takes both unless the runner-up reaches the threshold. The seat estimate updates every turn.

If you run in a 4-seat region and your party projects to 42% of the vote, expect about 2 seats. A UK Commons party below 10% gets no seat unless no party clears the gate.

### When the window closes

When the window closes: the final snapshot is captured, winners are declared (highest total in a single-seat race, largest remainder with the threshold in a multi-seat race), winners take office (their office bonuses start next turn), and a news post goes out. A resolved House or Senate election opens a new set of leadership ballots ([Congress Leadership](/wiki/congress-leadership)), finalises the seats and opens the presiding-officer ballot ([chamber leadership](/wiki/chamber-leadership)), and a new President clears the [Cabinet](/wiki/cabinet) (a re-elected President keeps theirs). Winning a presidential election adds a term to your count under [executive term limits](/wiki/executive-term-limits), and a capped character cannot file for the office or appear on the ballot. The race's campaigns are deleted; the candidate entries and politician history pages keep the result.

Presidential races resolve by Electoral College. State totals convert to electoral votes (Maine and Nebraska split by congressional district). A majority of the college the election apportioned wins: 270 of 538 on the modern roster, 266 of 531 in the 1950s. With no majority, including an exact tie, the race goes to a [contingent election](/wiki/contingent-election) in the House and Senate. After resolution, every character's Campaign Presence falls to 25% of its level (see [Political Operations](/wiki/political-operations)).

### Running mates

Each presidential candidate can pick a running mate, and a player nominee without one is given a tentative pick from their party when the primary resolves. The pick must be a player character from the same country, cannot be the current President, cannot be yourself, cannot be an active candidate in the same race, and cannot have used up the presidential term limit. If the ticket wins, the Vice President takes office alongside the President and gets +2 actions per turn and a ₳25,000 per turn fund bonus. You can change your running mate any time before the election resolves, or clear it entirely. A player running mate can also campaign for the ticket as a surrogate. See [Running Mate Surrogate Campaigning](/wiki/running-mate-surrogate).

### Losing after leading

Picture a two-way state general: your share of the votes cast is 52% through the 13 early turns and 50% through the 8 ramp turns, but an opponent's closing push holds you to 44% in the final 4 turns. Your final share is 0.5 x 52% + 0.2 x 50% + 0.3 x 44% = 26.0 + 10.0 + 13.2 = 49.2%. You led for 21 of 25 counting turns and still lost. The same race with the final band at 50% would have been 51.0%, a win. You need a strong closing week as well as a strong start.

**Why did I lose the general after winning the primary?** The primary electorate is your party's registered voters, scored on alignment with them. The general electorate is everyone, scored on alignment with each voter group, and your opponents spent the primary building their own groups. See [Primary vs General Tactics](/wiki/primary-general-tactics).

## Playing the three stages

Your phase plan decides when you spend; the longer version is in [Campaign Strategy](/wiki/campaign-strategy).

**Opening (first quarter of the general):**

- Campaign heavily in-state to push political influence above 60 and hold it.
- Run ads to lift favorability to 65-70. Above 70 returns diminish quickly.
- Set up campaign upgrades. See [Campaign Strategy](/wiki/campaign-strategy) and [Campaign Manager](/wiki/campaign-manager).

**Middle:**

- Hold influence above 60 with steady Campaign actions.
- Run periodic ads. Commission a Full Demographic Poll and target the weakest groups with ads and [canvassing](/wiki/canvassing). See [Polling](/wiki/polling).
- Watch for opponent damage: if your favorability drops 5 or more points in a short span, they are running research or attacking.

**Final sprint (last 4 turns):**

- Burst Campaign actions so influence peaks on the final snapshots, and burst ads for favorability.
- Canvass aligned groups. Canvassing is worth double once the race is 4 turns or fewer from its end.
- Log in hourly if it is close. A 2% favorability dip on one of the final turns can cost the seat.

**Do not:**

- Burn money on ads above favorability 80. The gain per ad is only +1.
- Sit on influence and hope decay is slow. At 0.75% per turn you lose about 14% over 20 turns, more if your party holds the national executive.
- Attack everyone. Attacks cost infamy and drain your own favorability.
- Forget out-of-state costs: Support and Attack on a player in another state cost 1.25x (neighbour) or 1.5x (other) more actions. Barnstorm has no distance cost.
- Withdraw to save resources unless you are pivoting. Withdrawn candidacies cannot be re-entered.

## What surrounds the general

Some inputs shape the vote model from outside. [One-Party States](/wiki/one-party-states) apply vote multipliers by party tier, and a [snap election](/wiki/snap-elections) replaces the regular one and runs on the same vote math. Campaign Presence from [Political Operations](/wiki/political-operations) raises a presidential candidate's vote weight, upgrades and field offices in the [Campaign Manager](/wiki/campaign-manager) add votes and turnout, and a surrogate's visits under [Running Mate Surrogate Campaigning](/wiki/running-mate-surrogate) add favorability and turnout. District maps from [US House Redistricting](/wiki/us-house-redistricting) decide which House seats are close.

On the output side, the [Vote Factor Ledger](/wiki/vote-factor-ledger) explains each presidential candidate's votes from the latest counting turn, and [Live Election Results](/wiki/live-election-results) shows what the general phase length and final-turn weighting reveal on election night. Resolving a presidential general cuts every stored presence level to 25%.

Thresholds above are for the US unless stated. The UK, Germany and Japan use their own cycle lengths and seat rules; see the country hubs. The Electoral College applies to the US presidency only. Live in every world and country with elections. Last checked 2026-10-30, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html). See also [Reference: Formulas](/wiki/reference-formulas) and [Fundraising and Ads](/wiki/fundraising-ads).
`;
