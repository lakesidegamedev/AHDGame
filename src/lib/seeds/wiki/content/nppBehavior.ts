export const nppBehaviorContent = `# NPP Behavior

Every turn, each NPP with a seat decides how to vote on the bills open in its chamber. The decision is not random: the NPP adds up a few pushes and pulls and votes the way the total points. If you know the pushes, you can predict a chamber before it votes, and you can see where a whip will help.

## How it works

An NPP votes on every open **federal** bill and every open **state or regional** bill. It adds up four forces, plus an optional fifth when its party backs the bill's sponsor.

| Force | What pushes it | Range |
| --- | --- | --- |
| **Ideology** | How well the bill's economic and social direction matches the NPP's own positions | -100 to +100 |
| **Whip** | Party and caucus whips, scaled by the NPP's compliance | -100 to +100 |
| **Party line** | A default lean for the sponsor's own party when no whip is set | 0 to +20 |
| **District** | How the NPP's home-state voters feel about the bill's chosen policy option | -100 to +100 |
| **Donors** | The NPP's donor level (0 to 5) times the same match as ideology | -100 to +100 |

The verdict uses a strict cutoff: a total **above +5** is For, **below -5** is Against, and anything from -5 to +5 inclusive is **Abstain**. There is no dice roll in a turn's vote. The only roll is when a **hard whip** is issued (see below).

### Compliance

Whips and the party line reach an NPP only through its **compliance**, a number from 0 to 1:

\`\`\`
compliance = 0.7 x loyalty/100 + 0.3 x (1 - stubbornness/100)
\`\`\`

| Loyalty | Stubbornness | Compliance | Party hard whip (60) lands as |
| --- | --- | --- | --- |
| 100 | 0 | 1.00 | 60 |
| 80 | 40 | 0.74 | 44 |
| 50 | 50 | 0.50 | 30 |
| 20 | 80 | 0.20 | 12 |

### Whips and the party line

- A **party whip** pushes with 30 (soft) or 60 (hard), times compliance.
- A **caucus whip** pushes with 40 whether soft or hard, plus or minus 20 more if the bill matches one of the caucus's core positions, times compliance.
- Party and caucus whips add together.
- With no whip at all, an NPP in the **same party as the bill's sponsor** gets a default push of 20 times its compliance towards For. Other NPPs get nothing.

When a **hard whip** is first issued, each NPP gets one hidden check: 55, plus 15, plus 0.35 times loyalty, plus the whipper's Statecraft bonus, minus 0.18 times stubbornness, held between 40 and 95. A pass writes the vote at once. A fail leaves the NPP to decide with the forces above. Rules and examples are on [Voting & Whips](/wiki/voting-and-whips).

### State and regional bills

Local legislators use the same model with different weights: district is multiplied by **1.35** (home voters matter more) and donors by **0.65**. State and regional chairs can whip their own NPPs. In a veto override vote an NPP cannot abstain: a result that would be Abstain becomes Against.

### Multi-seat weight and timing

An NPP counts once for every seat it holds: 7 House seats means 7 votes. NPPs vote every turn while a bill is open, so one that gains a seat mid-window still votes before it closes. Once voted, an NPP cannot change its vote.

### Key numbers

| Item | Value |
| --- | --- |
| Verdict cutoff | Above +5 For, below -5 Against, otherwise Abstain |
| Each force | Held between -100 and +100 |
| Party whip | 30 soft, 60 hard, times compliance |
| Caucus whip | 40, plus or minus 20 for core positions, times compliance |
| Party line | 20 times compliance |
| Hard whip check | 55 + 15 + 0.35 x loyalty - 0.18 x stubbornness, held at 40 to 95 |
| State bills: district / donors weights | 1.35 / 0.65 |

### Worked example

NPP A has loyalty 80, stubbornness 40 (compliance 0.74) and donor level 2. The bill points right on the economy and the NPP is at +3 economic, 0 social.

- Ideology: +60 (a 60% match)
- Whip: hard party whip For, 60 x 0.74 = **+44.4**
- District: -10
- Donors: 2/5 x 0.6 x 100 = **+24**
- Total: **+118** so For (a 7 seat NPP adds 7 votes).

NPP B has loyalty 50, stubbornness 50 (compliance 0.50) and donor level 3, and opposes the bill: ideology -70, district -20, donors 3/5 x -0.7 x 100 = -42, and the same hard whip For gives 60 x 0.50 = +30. Total: **-102**, so Against despite the whip.

## What you can do

- **Predict a vote.** An NPP's positions and donor level are on its profile. Work out the forces above for the bloc you care about; the ones that decide a close vote are whip and district.
- **Whip.** If you hold a whip seat, add whip force where the other forces are close. A whip cannot beat a strong ideology and district push by itself. See [Voting & Whips](/wiki/voting-and-whips).
- **Raise loyalty or lower stubbornness** through party NPP management; see [Party Actions](/wiki/party-actions).
- **Write bills to fit the majority.** Aim at the ideological centre of the NPPs who hold the most seats.

**Common questions.**
- *Why has an NPP not voted on my bill?* It votes only while the bill is open, and abstains when its forces nearly cancel.
- *Can I order an NPP to sponsor a bill?* No. NPPs sponsor bills only through the autonomy level your world uses; see [NPP Autonomy](/wiki/npp-autonomy).
- *Can I whip state legislature NPPs?* Yes, with a state or regional chair or vice chair seat.
- *Do NPPs decide US Speaker or floor leader races?* No. Those races are for players, and NPPs vote there only when a player whips them.

## Connections

**Driven by**

- [NPPs Overview](/wiki/npps-overview): loyalty, stubbornness, donors and home state feed the forces.
- [Party Ideology](/wiki/party-ideology): an NPP's positions set its ideology force.
- [Party Leadership](/wiki/party-leadership): officers issue the whips that add pressure.
- [Party Actions](/wiki/party-actions): party NPP work can raise loyalty and lower stubbornness.
- [NPP Autonomy](/wiki/npp-autonomy): at higher levels NPPs count votes before sponsoring and governments whip their own members.
- [Voting & Whips](/wiki/voting-and-whips): the whip system supplies the whip force.
- [game-starting-state](/wiki/game-starting-state): generated NPPs start from the opening seeds

**Affects**

- [Bills & Legislation](/wiki/bills-legislation): the NPP tally decides whether most bills pass.
- [Party Slate](/wiki/party-slate): an NPP's loyalty and stubbornness decide whether it accepts a Slate assignment.

## Status

Live in every world and country with legislatures. The extra steps for autonomy level 6 are described on [NPP Autonomy](/wiki/npp-autonomy).

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html).
`;
