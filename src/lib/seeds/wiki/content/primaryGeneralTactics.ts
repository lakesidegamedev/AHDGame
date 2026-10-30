export const primaryGeneralTacticsContent = `# Primary vs General Tactics

The moment your primary resolves, the game you were playing stops. You won by pleasing your own party's voters, and now everyone in the state votes. A player who wins the primary by hitting all the party-base notes will often lose the general if they do not pivot. This page is about **how** and **when** to pivot, and what you should absolutely not change. For phase rules see [Primaries](/wiki/primaries) and [General Elections](/wiki/general-elections). For tactical depth see [Campaign Strategy](/wiki/campaign-strategy).

## Two electorates, two scorecards

| Dimension | Primary | General |
| --- | --- | --- |
| Who votes | Your party's registered voters in the state | All voters in the state |
| How winner is chosen | Cumulative primary ballots, split each turn by primary-score standing | Vote accumulation across all turns |
| Biggest stat lever | Alignment to state lean and party platform (40 pts) | Appeal via policy positioning to demographics |
| Strategic target | Your party's registered voters | Swing demographics |
| Time pressure | Ballots count over the closing window of the primary, on the same closing surge | Gradient: final 4 turns weighted 30% |
| Cost multiplier on campaign upgrades | 1.0x | 1.5x |
| Attack rival candidates? | No (same party) | Carefully (opponents only) |
| NPP endorsements | +1.5 favorability each in the count (up to +6), plus campaign actions | Same as the primary |

## What you cannot change between primary and general

Some things are **locked** or costly to change once you enter a primary. Understand this before declaring:

- **Your policy positions** (econ and social on the -5 to +5 grid). They are not locked, but the only way to move them is Flip-Flop: one step on one axis for 15 actions (or a position voucher), +5 Infamy and -5% influence each time.
- **Your home state.** Relocating during a candidacy auto-withdraws.
- **Your party.** You run under the party you declared with. Declaring again under another party withdraws your old candidacy and carries your campaign across to the new one.
- **Whether NPPs in your primary get the 50% penalty.** That's fixed by the rules: an NPP's primary score is halved whenever a player is in the same party primary.

## What you can pivot

### Ad targeting

During primary you target your party's **base demographics** (groups whose lean matches your party platform). During general you target **swing demographics**: groups near the centre on both axes that could go either way.

If you declare in a centre-left party and won the primary by hammering Low Income and No degree voters, keep them. They still vote in the general. But **add** groups such as Degree holders, 30s and 40s, and (if applicable) Over 65s who are ideologically accessible with the right ads.

### Canvassing targeting

Primary canvassing can be tighter (your base groups). General canvassing should broaden:

- Primary: canvass 1-2 aligned groups where turnout drives your primary-base vote count.
- General: canvass 3-5 groups across the field, including some that **appeal to you but turn out low**.

### Campaign upgrade investment

Primary is the cheap phase for campaign-page upgrades. Every ₳1 spent here is ₳1; in general it's ₳0.67 of value per dollar (1.5x cost).

**Rule:** Upgrades are branch trees, not flat levels (see [Campaign Strategy](/wiki/campaign-strategy)). Unlock the starter for the levers you need (Fundraising, Ground Game, Media, Opposition Research) and buy into your chosen branches **before the primary ends**.

### Opposition Research target

Primary: research can only target the rivals in your own party's primary, so use it sparingly.
General: every other candidate is a valid target. Pick the leading opponent. Retarget as the race progresses if someone else becomes the threat.

### Campaign intensity

Primary: moderate. You're winning on alignment and Favorability, PI matters less than you'd think past ~40.
General: ramp. PI matters heavily in the state race reach x appeal x approval x party-org formula. Push PI to 70-80 for the closing sprint.

### Attack doctrine

Primary: **don't attack**. Same-party attacks raise your Infamy, drain your Favorability (primary-score bucket), and even if the rival gets hit they might still beat you.

General: **selective attacks**: each landed attack takes 1 point of Favorability and adds 2 Infamy, and fails with a chance equal to your Infamy. If an opponent's Favorability is 65-75 and 5-10 landed attacks drop them 5-10 points, that's often race-winning value. There is no extra protection at high Favorability, but one target can move at most 12 points a turn from support and attacks combined. Against under-50 opponents, they're already losing, don't waste Infamy.

## Presidential primary differences

The formula itself differs from state primaries:

- **Party Influence matters (20 pts).** Your own accumulated party influence, not a home-state org score.
- **National Reach matters (15 pts).** Built from national political influence via a diminishing-returns curve: NPI decays 1% per turn and settles at 100 times your per-turn gain, which comes from your state PI and your highest office or party role. Hold a national post across many cycles to keep it high.
- **Favorability is 25 pts.** Repriced up from a 10-point floor so the primary selects for something close to what the general rewards.
- **Alignment still 40 pts.** Still the biggest lever.

The implication: **presidential primaries reward party influence and Favorability**, not one-cycle PI bursts. State party org still matters in the general.

### Presidential general

- National race with Electoral College resolution.
- Independent penalty 0.3x vote share (70% reduction).
- Presidential Travel costs 3 to 10 actions by state electoral votes and boosts Favorability +1%/turn while in-state. Deploy to swing states in the final month.
- A half-rate (2%) FPTP spoiler applies in the presidential model, scaled by party organization: third parties drain a small share of votes from their ideologically-nearest major.
- Party-weighted positions (party + 3x candidate) / 4 mean your personal position matters more than your party (75% candidate, 25% party).
- Party org counts as a normalized share of the state's total organization, raised to the 0.2 power. Returns diminish, so a dominant party's edge is softened but a party with no org still gets almost nothing.
- State lean matters through the voter groups in each state: a red-leaning state has red-leaning groups, so a blue-aligned candidate starts behind there. Check the Full Poll before committing travel.

## A pivot in numbers

A House candidate wins the primary on the base of one group. Group A (the base) is 20% of the state at 60% turnout, so it is worth 12.0 vote units. Group B (a swing group) is 25% at 55% turnout, worth 13.75 units. The Full Poll after the primary shows 58% of Group A and 41% of Group B, which projects (0.58 x 12.0 + 0.41 x 13.75) / 25.75 = 49%. The pivot spends 10 ads and canvasses on Group B and lifts it to 46%, so the projection becomes (0.58 x 12.0 + 0.46 x 13.75) / 25.75 = 51.6%.

The numbers are illustrative, but the lesson is real: the swing group is larger than the base, so five points there is worth more than five points with the group you already own.

## The morning after the primary

The moment your primary resolves:

- [ ] Update ad targeting: broaden from base to swing groups.
- [ ] Start (or upgrade) Opposition Research on the frontrunner opponent.
- [ ] Commission Full Demographic Poll (base against swing groups, see [Demographics & Targeting](/wiki/demographics-targeting)): general voters are not the same as primary voters.
- [ ] Check campaign upgrade levels in the [Campaign Manager](/wiki/campaign-manager): are they sufficient? Last cheap opportunity to upgrade was the primary phase; you're now in 1.5x-cost territory.
- [ ] Treat fogged opponent upgrade levels with caution: they come from the old single-level fields and do not reflect Strategic Ops trees.
- [ ] Plan closing-sprint burst budget: reserve actions and funds for the final 4 turns.
- [ ] Request NPP endorsements from any NPP whose policy positions align and who is not in an opposing party (see [NPP Elections](/wiki/npp-elections) for handling NPP competition).

## Office-specific notes

| Office | Strategic key |
| --- | --- |
| US House | One race per state delegation. Seats split by party vote, and a party needs 1/(seats + 1) of the vote, between 10% and 20%, to win any. In worlds with redistricting on, seats resolve district by district. Spread party ads across many districts. |
| US Senate | Single-seat statewide. Broad demographic appeal matters. Attack the opponent's soft groups. |
| US Governor | Single-seat statewide. Office strength 1.0 and state government approval scale the size of the whole vote pool for every candidate alike, so they do not favour you over your rival. |
| US President | Electoral College + state lean + party-weighted positions + swing-state travel. Very different game from state races. |
| UK MP (Commons) | Multi-seat regional PR with a 10% gate. Party org helps but enters on a 0.2 power: a 60% to 40% org edge is worth only about 8% more vote weight, so candidates still matter. |
| UK Prime Minister | No direct election. A party or coalition chair whose bloc holds enough Commons seats nominates a candidate, then the Commons votes on the appointment. |
| DE Bundestag | Mixed-member PR: Land races fill the direct seats, then list seats top each party up to its federal share (5% or 3 direct seats to qualify). No campaign page yet. |
| DE Chancellor | Nominated by an eligible party or coalition chair, then voted on by the Bundestag. Same path as the UK PM. |
| JP Sangiin / Shūgiin | Regional proportional races in both chambers. In a 1991 world the Shūgiin can move to the 1994 mixed system of district seats plus regional lists, where a direct winner cannot also take a list seat. |
| JP Prime Minister | Nominated by an eligible party or coalition chair, then voted on by the Shūgiin. Same path as the UK PM. |

## Mistakes people make after winning

- **Shifting ad messaging too early in the general.** Your party base is still voting; don't abandon them day 1.
- **Attacking primary rivals after the fact.** They're out of the race; Infamy gain is wasted.
- **Ignoring Opposition Research entirely.** The starter node drains the frontrunner's favorability by 0.5% a turn and doubles in the last 4 turns, which adds up over a 24-turn general and is often race-deciding.
- **Upgrading campaign tiers during general at 1.5x cost.** Upgrade during primary.
- **Over-travelling in presidential.** Travel is +1% Favorability/turn, but each move costs 3 to 10 actions by state electoral votes. Don't travel constantly. Pick strategic states and stay.
- **Not planning the closing sprint.** Reserve ~30% of your general-phase fund budget for the final 4 turns.

Applies wherever a primary precedes a general. Last checked 2026-10-30, version 1.18.0. Exact rules: [Primary vs General Tactics (design)](https://docs.lakesidegames.net/design/primary-general-tactics.html). See also [Election Mechanics](/wiki/election-mechanics) for the core framework.
`;
