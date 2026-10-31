export const statsActionsContent = `# Stats & Actions

Your meters are always sliding. Influence decays, favorability and infamy drift, and the only way to push back is to spend actions on Campaign, ads, donor building and the rest. Costs rise as the meters rise, so the early game is cheap and the late game is a maintenance budget. This page is the look-up for what each meter does, what each action costs and what it changes. For the hourly clock and where actions come from, read [Core Systems](/wiki/core-systems) first, whose turn and fund income set the budget these actions spend.

## Your seven stats

The stats are set at [character creation](/wiki/create-a-character) and scale action effects, costs and caps. Seven stats, each from 1 to 10: Charisma, Debate, Energy, Fundraising, Business Acumen, Statecraft and Intellect. At character creation you spread 28 points across them with a minimum of 1 each. Use raises them slowly and idle time lowers them. Each stat gives a gentle multiplier of about plus or minus 20% around a neutral 5.5. Energy sets your action cap and hoard threshold (see [Core Systems](/wiki/core-systems)), and Fundraising scales what Fundraise earns. More detail is on [RPG Stats](/wiki/rpg-stats).

## The meters at a glance

| Meter | Starts at | Scale | Moves by |
| --- | --- | --- | --- |
| Political Influence (PI) | 10 | 0 to 100, per state | +1 per Campaign (less above 50, never below +0.1), decays 0.75% per turn |
| National Influence (NPI) | 0 | no cap | decays 1% per turn, gains a PI term and a position bonus |
| Favorability | 50 | 0 to 100 | +1 to 3 per ad, drifts down above 60 |
| Infamy | 0 | 0 to 100 | +2 per Attack, decays 5% per turn |
| Donor Base level | 1 | no enforced cap, tuned for 0 to 75 | +1 per Build Donor Network |
| Campaign Funds | ₳250,000 | none | Fundraise, per-turn income, spending |
| Cash on Hand | ₳1,000,000, ₳2,500,000 or ₳5,000,000 | none | by wealth background, dividends, coupons |
| Actions | 25 | cap 200 to 250 | +4 base per turn plus bonuses |

Why PI starts at 10 and not 0: new characters begin at the same 10 that non-player politicians (NPPs) are seeded with, so someone who joins a running world does not start below every rival.

## Political Influence (PI)

PI is your standing in your home state and the most important early number. It drives vote reach and primary scores in state races ([Election Mechanics](/wiki/election-mechanics)), and together with Favorability and donor level it decides whether you can win each rung of [Player Progression](/wiki/player-progression). A move resets it: [Relocation](/wiki/relocation) sets PI and donor level to 0, and NPI on a country change. Because decay is a percentage, a low-PI character loses little per turn, but you must keep campaigning to stay competitive.

\`\`\`wiki-chart
political-influence-over-time
\`\`\`

Your party also touches PI: [Political Parties](/wiki/political-parties) set your share of actions and the governing-party decay. Members of the party holding the national executive (the president's party, or the head of government's party in a parliamentary system) lose PI faster, scaled by that government's approval: twice as fast at 0% approval, 1.5 times at 50%, and normal at 100%.

If you are asking "why did my PI drop": it decays every turn, and if your party runs the government it decays faster. Campaign to hold it.

## National Influence (NPI)

NPI is your national reputation. In elections it drives presidential races only: both reach and appeal. It is also spent to put policy provisions into national bills, and it orders German Landesliste places. It decays 1% per turn, then gains a state PI term plus a position bonus.

\`\`\`wiki-chart
national-influence-gain-from-pi
\`\`\`

| Home-state PI | NPI gained per turn from PI |
| ---: | ---: |
| 0 | -0.5 |
| 25 | 0 |
| 50 | +0.5 |
| 75 | +1.25 |
| 100 | +2.0 |

The position bonus uses only your single highest tier: national head of government or executive head of state +2.5; Vice President, deputy head of government, presiding officers, majority leaders and national party chair +2.0; confirmed cabinet, governor, Supreme Court justice, central bank chair, minority leaders, party vice chair or treasurer +1.5; national legislator or ceremonial head of state +1.0; acting cabinet +0.75; state legislator or state party chair +0.5; a long-serving CEO of a large listed corporation +0.3 or +0.15. Leading an international organisation adds +1.0 on top. The full table is in the [Elections Player Guide](/wiki/elections-player-guide), which is also where NPI drives presidential races.

**Where NPI settles.** Decay is proportional, so NPI settles at 100 times your per-turn gain. At PI 30 (a PI term of +0.1), a head of government settles near 260, a national legislator near 110, a state legislator near 60 and someone with no office near 10. After you leave office, NPI loses half the gap to its new level in about 69 turns.

**How it feeds elections.** In a general election NPI reach rises on a square-root curve and caps at 1.0 at NPI 100: NPI 25 gives 0.5, NPI 50 about 0.71, NPI 85 about 0.92. In a presidential primary a separate curve keeps rising without a hard cap: NPI 25 gives about 0.43, NPI 50 about 0.67, NPI 100 about 0.89. Only serious presidential contenders should optimise for NPI.

## Favorability

Favorability is how voters feel about you and multiplies your appeal in every race. On its own it is stable at 60 or below. Above 60 it drains by 0.05 per point over 60 each turn if you stop running ads, and ads give less the higher you are: each ad adds 3 minus 0.1 per point above 70, scaled by Charisma and rounded down, never less than 1. If your party is in government or holds a chamber majority while the government's approval is under 50, you also lose up to 0.25 a turn. Attacks from opponents lower it. Infamy above 20 also drains it by (infamy - 20) x 0.05 per turn, so Infamy 40 costs 1 point a turn and Infamy 100 costs 4.

## Infamy

Infamy is a budget, not a punishment. Each Attack adds 2. Infamy decays 5% of its value per turn. It only drains Favorability above 20, but any Infamy raises your Attack failure chance, trims your primary score (up to 5% at 100) and slows your Party Influence. The chance an Attack fails equals your Infamy as a percentage (Infamy 20 means 20%), and a failed Attack still costs you the actions, the funds and the 2 Infamy. Two to four attacks on a rival is cheap. Twenty or more builds real damage to your own Favorability.

## Policy positions

Two axes, economic and social, each from -5 to +5, set at creation. You can also shift one point on an axis from Settings or Actions for 15 actions, 5 Infamy and 5% of your Political and National Influence, or for a Position Update Voucher. Voting on bills moves you at most 0.25 per axis per bill: an Aye pulls you toward the bill's average position (never past it), a Nay pushes you 0.25 away, and re-voting is measured from where you stood before that bill, so flipping cannot stack. The vote buttons show the exact move first. Positions set your primary alignment with your party, how each demographic group sees you, and your share of the party action pool. A long career of floor votes causes drift, and a large drift from your party lowers primary scores and party bonuses.

## Donor Base level

Donor level raises both your income and your Fundraise yield (see [Fundraising & Ads](/wiki/fundraising-ads), where Fundraise yield and ad costs come from these rules). Build Donor Network costs actions that rise with level (4 at level 0 to 6, 13 at level 50, 20 at level 75) and funds of ₳3,000 plus ₳1,500 per current level, scaled by state GDP per person (0.85 to 2.0 times), rounded to the nearest ₳1,000 and lowered by your Fundraising stat. At average GDP and a neutral stat, level 1 to 2 costs about ₳5,000 and level 74 to 75 costs about ₳114,000. Income per level per turn depends on the state's population: ₳100 (under 2 million), ₳200 (2 to 8 million), ₳400 (8 to 20 million) or ₳800 (over 20 million). If a move or event resets you to level 0, Fundraise is locked until you build one level.

\`\`\`wiki-chart
donor-base-costs
\`\`\`

## Party Influence

Party Influence applies only to party members and has no fixed cap. Each turn it decays 4% and gains up to 3 scaled by how close your positions are to the party platform, plus a flat bonus for leadership roles (party chair +5, vice chair or treasurer +2, state party or caucus chair +2, committee member, state vice chair or caucus vice chair +1), minus an Infamy penalty of up to 4. Leaving and rejoining resets it to 0. It sets your share of the party's bonus action pool each turn (3 actions per member, at most 6 for you), scaled by the same closeness. You can see it in your profile's Political standing section.

## What each action costs

All costs below are for a new character at a state with average GDP per person. The in-game quote shows your exact cost before you click.

### Campaigning, fundraising and polls

| Action | Actions | Funds | Effect |
| --- | --- | --- | --- |
| Campaign | 1 below PI 20, then 2, 3, 4, 5 at PI 20, 40, 60, 80 | ₳20,000, ₳48,000, ₳84,000, ₳128,000, ₳180,000 by cost tier | +1 PI |
| Fundraise | 3 | none | Earns a yield (see below), needs donor level above 0 |
| Run Advertisements | 5, 6, 7, 8, 9 at Favorability under 30, 30, 50, 70, 85 | ₳100,000, ₳120,000, ₳140,000, ₳160,000, ₳180,000 by cost tier | +1 to 3 Favorability |
| Build Donor Network | 4 to 20 by level | ₳3,000 + ₳1,500 x level, GDP scaled | +1 donor level |
| Quick Poll | 2 | ₳25,000 | topline plus best and worst 5 groups |
| Full Demographic Poll | 6 | ₳75,000 | complete breakdown |
| Personal Campaign Donation | 2 | converts Cash on Hand | 50% lands in Campaign Funds, 50% is lost |
| Post news | 0 | none | free article, 12-hour cooldown |
| Sponsored news post | 5 | ₳100,000 of personal cash | paid placement, 30-minute cooldown |
| Rest | 0 | none | does nothing and does not count as activity |

Campaign and ad funds are multiplied by a GDP factor: your state's GDP per person against the country average, held between 0.85 and 2.0. The figures here assume a factor of 1. Polls scale by up to 20% with your Intellect; see [Polling](/wiki/polling) for the poll action costs and the Intellect modifier on fund cost. A free article costs nothing, and a sponsored post needs 5 actions and ₳100,000 ([News](/wiki/news)).

**Fundraise yield** is the one formula worth knowing: (₳50,000 + ₳2,000 x donor level) x (1 + state PI / 100) x your Fundraising stat multiplier. A level 2 character at PI 10 with a neutral stat earns ₳59,400. A level 50 character at PI 50 earns ₳225,000.

**Moving Cash on Hand into Campaign Funds.** Use Personal Campaign Donation. It costs 2 actions, takes all the cash you choose, lands 50% in Campaign Funds (the other 50% is lost), and adds Infamy: about 4 for ₳100,000, 15 for ₳1,000,000 and 55 for ₳10,000,000.

### Supporting and attacking other characters

Target another character or NPP from their profile. Cross-country targets are blocked.

| Action | Effect on target | Effect on you |
| --- | --- | --- |
| Support | +1 Favorability | none |
| Attack | -1 Favorability (fails at your Infamy % chance) | +2 Infamy, always |
| Barnstorm | +1 PI, or +2 if your home state matches theirs | none |

Costs are not flat. They are priced from what it would cost the **target** to gain the same amount on their own: Support is 1.25 times the Run Advertisements cost, Attack is 1.5 times, and Barnstorm is 1.25 times the Campaign cost. Actions are rounded down and funds to the nearest unit. Out-of-state targets multiply the action cost of Support and Attack by 1.25 for a neighbouring state and 1.5 for a non-neighbour. Barnstorm has no distance multiplier. You cannot Support or Attack yourself. A single target can move at most 12 Favorability net per turn.

**Worked example.** A rival at Favorability 50 would pay 7 actions and ₳140,000 for an ad. For you, Support costs 8 actions and ₳175,000, and Attack costs 10 actions and ₳210,000. If the rival lives in a neighbouring state, the action costs become 10 for Support and 13 for Attack, and the funds stay the same. Barnstorming an ally with PI 30 in your home state needs two Campaign uses at 2 actions and ₳48,000 each, so it costs 5 actions and ₳120,000. A non-home-state ally needs only one use, so 2 actions and ₳60,000.

### Presidential travel (US general election only)

Active presidential candidates can set a travel state, which matters in the general phase. Travel costs 3 to 10 actions by the state's electoral votes (up to 5 EV is 3, up to 10 is 5, up to 20 is 7, over 20 is 10). It sets your travel state, unlocks canvassing there and adds +1 Favorability per turn while you stay. You can be in one US state at a time, and switching costs the same again.

### Dealing with NPPs

From an NPP profile (see [NPPs Overview](/wiki/npps-overview), where these actions change NPP favorability, influence and relationship), these are fixed actions gated by your relationship score with that NPP (-100 to +100), not random rolls.

| Action | Actions | Funds | Effect |
| --- | ---: | ---: | --- |
| Request Endorsement | 6 | none | Public endorsement of your current candidacy, if the relationship gate is met |
| Private Meeting | 3 | none | +5 relationship |
| Boost Favorability | 5 | ₳10,000 | +3 NPP favorability, +2 relationship |
| Reduce Favorability | 5 | ₳10,000 | -3 NPP favorability, -2 relationship |
| Boost Influence | 6 | ₳20,000 | +2 NPP PI, +2 relationship |
| Reduce Influence | 6 | ₳20,000 | -2 NPP PI, -2 relationship |

There is no Request Withdrawal, Request Opposition or Request Leadership Support action.

### Party chairs

Party chairs, vice chairs and confirmed campaigners spend the party's NPP action points (1 per action, plus a treasury cost) on NPP management, through the state party in-state and the national party nationally. The points regenerate each turn at a fixed rate set by the party's tier (major or minor). See [Political Parties](/wiki/political-parties) and [Party Organization](/wiki/party-organization).

## What changes each turn, in order

1. If you hold more actions than your hoard threshold (100 to 125, set by Energy), you lose 4.
2. The base 4 actions arrive, with office, leadership, justice and central bank bonus actions.
3. In the same step, PI decays 0.75% (faster for the governing party), Infamy decays 5%, Favorability drains if above 60, if Infamy is above 20 or if your government is unpopular, and NPI decays 1% then gains the PI term and your position bonus.
4. Campaign Funds arrive: base rate, donor bonus and office bonus.
5. Your party bonus is paid from the pool.

Bills, NPP behavior, elections and most other systems run afterward.

![Actions arrive first, then Campaign Funds, then Political Influence, Infamy, Favorability and National Political Influence decay or drain.](/wiki-images/diagrams/stats-actions-turn-order.svg)

Live in every world and era; which offices give action bonuses and which actions apply (presidential travel is US-only, for example) depends on your country. Last checked 2026-10-29, version 1.18.0. Exact rules: [Stats & Actions (design)](https://docs.lakesidegames.net/design/stats-actions.html)
`;
