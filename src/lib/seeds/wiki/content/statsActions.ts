export const statsActionsContent = `# Stats & Actions

Every character carries seven skill stats and a set of meters (influence, favorability, funds, donors), and spends actions to change them. This page is the look-up for what each one does, what each action costs and what it changes. For the big picture of time, actions and money, read [Core Systems](/wiki/core-systems) first.

## How it works

Each hour a turn adjusts your meters: influence decays, favorability and infamy drift, funds arrive and actions refresh. You push back by spending actions on Campaign, ads, donor building and the rest. Costs rise as your meters rise, so the early game is cheap and the late game is a maintenance budget.

### Character stats

Seven stats, each from 1 to 10: Charisma, Debate, Energy, Fundraising, Business Acumen, Statecraft and Intellect. At character creation you spread 28 points across them with a minimum of 1 each. Use raises them slowly and idle time lowers them. Each stat gives a gentle multiplier of about plus or minus 20% around a neutral 5.5. Energy sets your action cap and hoard threshold, and Fundraising scales what Fundraise earns. More detail is on [RPG Stats](/wiki/rpg-stats).

### Meters and key numbers

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

### Political Influence (PI)

PI is your standing in your home state and the most important early number. It drives vote reach and primary scores in state races. Because decay is a percentage, a low-PI character loses little per turn, but you must keep campaigning to stay competitive.

Members of the party holding the national executive (the president's party, or the head of government's party in a parliamentary system) lose PI faster, scaled by that government's approval: twice as fast at 0% approval, 1.5 times at 50%, and normal at 100%.

If you are asking "why did my PI drop": it decays every turn, and if your party runs the government it decays faster. Campaign to hold it.

### National Influence (NPI)

NPI is your national reputation. It drives presidential races only: both reach and appeal. It decays 1% per turn, then gains a state PI term plus a position bonus.

| Home-state PI | NPI gained per turn from PI |
| ---: | ---: |
| 0 | -0.5 |
| 25 | 0 |
| 50 | +0.5 |
| 75 | +1.25 |
| 100 | +2.0 |

The position bonus uses only your single highest tier: national head of government or executive head of state +2.5; Vice President, deputy head of government, presiding officers, majority leaders and national party chair +2.0; confirmed cabinet, governor, Supreme Court justice, central bank chair, minority leaders, party vice chair or treasurer +1.5; national legislator or ceremonial head of state +1.0; acting cabinet +0.75; state legislator or state party chair +0.5; a long-serving CEO of a large listed corporation +0.3 or +0.15. Leading an international organisation adds +1.0 on top. The full table is in the [Elections Player Guide](/wiki/elections-player-guide).

**Where NPI settles.** Decay is proportional, so NPI settles at 100 times your per-turn gain. At PI 30 (a PI term of +0.1), a head of government settles near 260, a national legislator near 110, a state legislator near 60 and someone with no office near 10. After you leave office, NPI loses half the gap to its new level in about 69 turns.

**How it feeds elections.** In a general election NPI reach rises on a square-root curve and caps at 1.0 at NPI 100: NPI 25 gives 0.5, NPI 50 about 0.71, NPI 85 about 0.92. In a presidential primary a separate curve keeps rising without a hard cap: NPI 25 gives about 0.43, NPI 50 about 0.67, NPI 100 about 0.89. Only serious presidential contenders should optimise for NPI.

### Favorability

Favorability is how voters feel about you and multiplies your appeal in every race. It is stable at 60 or below. Above 60 it slowly drains if you stop running ads, and ads give less the higher you are: each ad adds 3 minus 0.1 per point above 70, never less than 1. Attacks from opponents lower it. Infamy above 20 also drains it by (infamy - 20) x 0.05 per turn, so Infamy 40 costs 1 point a turn and Infamy 100 costs 4.

### Infamy

Infamy is a budget, not a punishment. Each Attack adds 2. Infamy decays 5% of its value per turn. It does nothing below 20. The chance an Attack fails equals your Infamy as a percentage (Infamy 20 means 20%), and a failed Attack still costs you the actions, the funds and the 2 Infamy. Two to four attacks on a rival is cheap. Twenty or more builds real damage to your own Favorability.

### Policy positions

Two axes, economic and social, each from -5 to +5, set at creation. Voting on bills moves you at most 0.25 per axis per bill: an Aye pulls you toward the bill's average position (never past it), a Nay pushes you 0.25 away, and re-voting is measured from where you stood before that bill, so flipping cannot stack. The vote buttons show the exact move first. Positions set your primary alignment with your party, how each demographic group sees you, and your share of the party action pool. A long career of floor votes causes drift, and a large drift from your party lowers primary scores and party bonuses.

### Donor Base level

Donor level raises both your income and your Fundraise yield. Build Donor Network costs actions that rise with level (4 at level 0 to 9, 13 at level 50, 20 at level 75) and funds of ₳3,000 plus ₳1,500 per current level, scaled by state GDP per person (0.85 to 2.0 times). At average GDP, level 1 to 2 costs about ₳4,500 and level 74 to 75 costs about ₳114,000. Income per level per turn depends on the state's population: ₳100 (under 2 million), ₳200 (2 to 8 million), ₳400 (8 to 20 million) or ₳800 (over 20 million). If a move or event resets you to level 0, Fundraise is locked until you build one level.

### Party Influence

Party Influence runs from 0 to 100 and applies only to party members. It accrues passively while you are active, grows with the operations your party invests in, and decays with inactivity. Leaving and rejoining resets it to 0. It sets your share of the party's bonus action pool each turn, amplified by how close your positions are to the party platform. You can see it in your profile's Party Standing section.

## What you can do

All costs below are for a new character at a state with average GDP per person. The in-game quote shows your exact cost before you click.

### Standard campaign actions

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
| Rest | 0 | none | resets per-turn cooldowns |

Campaign and ad funds are multiplied by a GDP factor: your state's GDP per person against the country average, held between 0.85 and 2.0. The figures here assume a factor of 1. Polls scale by up to 20% with your Intellect.

**Fundraise yield** is the one formula worth knowing: (₳50,000 + ₳2,000 x donor level) x (1 + state PI / 100) x your Fundraising stat multiplier. A level 2 character at PI 10 with a neutral stat earns ₳59,400. A level 50 character at PI 50 earns ₳225,000.

**Moving Cash on Hand into Campaign Funds.** Use Personal Campaign Donation. It costs 2 actions, takes all the cash you choose, lands 50% in Campaign Funds (the other 50% is lost), and adds Infamy: about 4 for ₳100,000, 15 for ₳1,000,000 and 55 for ₳10,000,000.

### Interpersonal actions

Target another character or NPP from their profile. Cross-country targets are blocked.

| Action | Effect on target | Effect on you |
| --- | --- | --- |
| Support | +1 Favorability | none |
| Attack | -1 Favorability (fails at your Infamy % chance) | +2 Infamy, always |
| Barnstorm | +1 PI, or +2 if your home state matches theirs | none |

Costs are not flat. They are priced from what it would cost the **target** to gain the same amount on their own: Support is 1.25 times the Run Advertisements cost, Attack is 1.5 times, and Barnstorm is 1.25 times the Campaign cost. Actions are rounded down and funds to the nearest unit. Out-of-state targets multiply the action cost of Support and Attack by 1.25 for a neighbouring state and 1.5 for a non-neighbour. Barnstorm has no distance multiplier. You cannot Support or Attack yourself. A single target can move at most 12 Favorability net per turn.

**Worked example.** A rival at Favorability 50 would pay 7 actions and ₳140,000 for an ad. For you, Support costs 8 actions and ₳175,000, and Attack costs 10 actions and ₳210,000. If the rival lives in a neighbouring state, the action costs become 10 for Support and 13 for Attack, and the funds stay the same. Barnstorming an ally with PI 30 in your home state needs two Campaign uses at 2 actions and ₳48,000 each, so it costs 5 actions and ₳120,000. A non-home-state ally needs only one use, so 2 actions and ₳60,000.

### Presidential travel (US general election only)

Active presidential candidates can travel during the general phase. Travel costs 3 to 10 actions by the state's electoral votes (up to 5 EV is 3, up to 10 is 5, up to 20 is 7, over 20 is 10). It sets your travel state, unlocks canvassing there and adds +1 Favorability per turn while you stay. You can be in one US state at a time, switching costs the same again, and travel ends on withdrawal or election end.

### NPP direct actions

From an NPP profile, these are fixed actions gated by your relationship score with that NPP (-100 to +100), not random rolls.

| Action | Actions | Funds | Effect |
| --- | ---: | ---: | --- |
| Request Endorsement | 6 | none | Public endorsement of your current candidacy, if the relationship gate is met |
| Private Meeting | 3 | none | +5 relationship |
| Boost Favorability | 5 | ₳10,000 | +3 NPP favorability, +2 relationship |
| Reduce Favorability | 5 | ₳10,000 | -3 NPP favorability, -2 relationship |
| Boost Influence | 6 | ₳20,000 | +2 NPP PI, +2 relationship |
| Reduce Influence | 6 | ₳20,000 | -2 NPP PI, -2 relationship |

There is no Request Withdrawal, Request Opposition or Request Leadership Support action. See [NPPs Overview](/wiki/npps-overview).

### Party-level actions

Party chairs and vice chairs spend the party action pool on influence operations against NPPs, in-state for regional chairs and nationally for the National Chair. The pool refills each turn from member contributions. See [Political Parties](/wiki/political-parties) and [Party Organization](/wiki/party-organization).

### Each turn, in order

1. If you hold more actions than your hoard threshold (100 to 125, set by Energy), you lose 4.
2. The base 4 actions arrive.
3. Office, leadership, justice and central bank bonus actions arrive.
4. Your party bonus is paid from the pool.
5. Campaign Funds arrive: base rate, donor bonus and office bonus.
6. PI decays 0.75% (faster for the governing party).
7. Infamy decays 5%.
8. Favorability drains if above 60 or if Infamy is above 20.
9. NPI decays 1%, then gains the PI term and your position bonus.

Bills, NPP behavior, elections and everything else run afterward.

## Connections

**Driven by**

- [Core Systems](/wiki/core-systems): the hourly turn, action refresh and fund income set the budget these actions spend.
- [Create a Character](/wiki/create-a-character): your seven stats and starting meters are set at creation.
- [Relocation](/wiki/relocation): a move resets PI and donor level to 0, and resets NPI on a country change.
- [Player Progression](/wiki/player-progression): the office you hold sets action bonuses and the NPI position bonus.
- [Political Parties](/wiki/political-parties): your party share of actions and the governing-party PI decay.
- [RPG Stats](/wiki/rpg-stats): the seven stats scale action effects, costs and caps.

**Affects**

- [Core Systems](/wiki/core-systems): Energy sets the action cap and hoard threshold, and Fundraising scales income.
- [Player Progression](/wiki/player-progression): PI, Favorability and donor level decide whether you can win each office.
- [Election Mechanics](/wiki/election-mechanics): PI, NPI and Favorability feed vote reach, appeal and primary scores.
- [Elections Player Guide](/wiki/elections-player-guide): NPI drives presidential races and position bonuses.
- [Fundraising & Ads](/wiki/fundraising-ads): Fundraise yield and ad costs come from these rules.
- [NPPs Overview](/wiki/npps-overview): NPP direct actions change NPP favorability, influence and relationship.
- [News](/wiki/news): posting costs actions and cash, sponsored posts need 5 actions and ₳100,000.
- [Polling](/wiki/polling): poll action costs and the Intellect modifier on fund cost.

## Status

Live in every world and era. Which offices give action bonuses and which actions apply (for example presidential travel, which is US-only) depends on your country.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Every constant, source file and full formula is on the [Stats & Actions design page](https://docs.lakesidegames.net/design/stats-actions.html).
`;
