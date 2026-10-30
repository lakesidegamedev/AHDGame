export const nppBehaviorContent = `# NPP Behavior

A 60-point hard whip can still lose to an NPP that dislikes the bill. Every turn, each NPP with a seat decides how to vote on the bills open in its chamber, and the decision is not random: it adds up a few pushes and pulls and votes the way the total points. If you know the pushes, you can predict a chamber before it votes, and you can see where a whip will help.

## The forces

An NPP votes on every open **federal** bill and every open **state or regional** bill in its chamber. It adds up four forces, plus a party-line lean when it shares the sponsor's party and no whip is set.

| Force | What pushes it | Range |
| --- | --- | --- |
| **Ideology** | How well the bill's economic and social direction matches the NPP's own positions | -100 to +100 |
| **Whip** | The party whip that applies to the NPP, scaled by its compliance | -100 to +100 |
| **Party line** | A default lean for the sponsor's own party when no whip is set, added to ideology | 0 to +20 |
| **District** | How the NPP's home-state voters feel about the bill's chosen policy option | -100 to +100 |
| **Donors** | The NPP's donor level (0 to 5) times the same match as ideology | -100 to +100 |

An NPP's positions set its ideology force ([Party Ideology](/wiki/party-ideology)); its loyalty, stubbornness, donors and home state come from [NPPs Overview](/wiki/npps-overview), and generated NPPs start from the opening seeds ([game-starting-state](/wiki/game-starting-state)). The verdict uses a strict cutoff: a total **above +5** is For, **below -5** is Against, and anything from -5 to +5 inclusive is **Abstain**. There is no dice roll in a turn's vote. The only roll on a bill is when a **hard whip** is issued.

A few smaller nudges also land in the ideology force: +8 towards For when a co-partisan leader's active address emphasises the bill's category, and, at autonomy level 1 or above, a push against the governing party's bills for members of the main opposition party when no whip is set.

![Ideology, whip, party line, district and donors added into one total, with For above plus 5, Abstain from minus 5 to plus 5 and Against below minus 5.](/wiki-images/diagrams/npp-behavior-force-sum.svg)

## Why a whip lands softer than you expect

Whips, the party line and the opposition push reach an NPP only through its **compliance**, a number from 0 to 1:

\`\`\`
compliance = 0.7 x loyalty/100 + 0.3 x (1 - stubbornness/100)
\`\`\`

\`\`\`wiki-chart
npp-compliance-by-loyalty
\`\`\`

| Loyalty | Stubbornness | Compliance | Party hard whip (60) lands as |
| --- | --- | --- | --- |
| 100 | 0 | 1.00 | 60 |
| 80 | 40 | 0.74 | 44 |
| 50 | 50 | 0.50 | 30 |
| 20 | 80 | 0.20 | 12 |

Party NPP management can raise loyalty and lower stubbornness ([Party Actions](/wiki/party-actions)). The whips themselves are issued by party officers ([Party Leadership](/wiki/party-leadership)); the system is described in [Voting & Whips](/wiki/voting-and-whips).

- A **party whip** pushes with 30 (soft) or 60 (hard), times compliance. A governing party with a cabinet discipline effect pushes up to 20% harder.
- A state party whip from the NPP's home state wins over a national one. A national whip reaches an NPP only when its home-state party has no player chair or vice chair.
- A **caucus whip** does not enter the turn's vote. A soft caucus whip on a bill has no effect on NPPs; a hard one runs the same hidden check as a hard party whip.
- With no whip at all, an NPP in the **same party as the bill's sponsor** gets a default push of 20 times its compliance towards For. Other NPPs get nothing.

When a **hard whip** is first issued, each NPP gets one hidden check: 55, plus 15, plus 0.35 times loyalty, plus the whipper's Statecraft bonus, minus 0.18 times stubbornness, held between 40 and 95. It runs for every NPP not already voting the whipped way, including NPPs that voted earlier. A pass writes the whipped vote at once. A fail writes the vote the forces give, with the full hard whip push of 60 times compliance included. Rules and examples are on [Voting & Whips](/wiki/voting-and-whips).

## Two NPPs, one whip

NPP A has loyalty 80, stubbornness 40 (compliance 0.74) and donor level 2. The bill points right on the economy and the NPP is at +3 economic, 0 social.

- Ideology: +60 (a 60% match)
- Whip: hard party whip For, 60 x 0.74 = **+44.4**
- District: -10
- Donors: 2/5 x 0.6 x 100 = **+24**
- Total: **+118** so For (a 7 seat NPP adds 7 votes).

NPP B has loyalty 50, stubbornness 50 (compliance 0.50) and donor level 3, and opposes the bill: ideology -70, district -20, donors 3/5 x -0.7 x 100 = -42, and the same hard whip For gives 60 x 0.50 = +30. Total: **-102**, so Against despite the whip.

A whip cannot beat a strong ideology and district push by itself. The forces that decide a close vote are whip and district, so work out the total for the bloc you care about from each NPP's profile, and write bills aimed at the ideological centre of the NPPs holding the most seats.

## State bills, vetoes and timing

Local legislators use the same model with different weights: district is multiplied by **1.35** (home voters matter more) and donors by **0.65**. State and regional chairs and vice chairs can whip their own NPPs. In a veto override vote an NPP cannot abstain: a result that would be Abstain becomes Against.

An NPP counts once for every seat it holds: 7 House seats means 7 votes, and the tally decides whether most bills pass ([Bills & Legislation](/wiki/bills-legislation)). NPPs vote every turn while a bill is open, so one that gains a seat mid-window still votes before it closes. Once voted, an NPP keeps its vote at later turns; only a hard whip can change it. An abstention is a recorded vote. An NPP that never votes is a technocrat, belongs to a party banned in a one-party state, or sits in a chamber whose voting window has already closed. You cannot order an NPP to sponsor a bill; that happens only through the autonomy level your world uses ([NPP Autonomy](/wiki/npp-autonomy)), where at higher levels NPPs count votes before sponsoring and governments whip their own members. US Speaker and floor leader races are for players, and NPPs vote there only when a player whips them.

An NPP's loyalty and stubbornness also decide whether it accepts an assignment on the [Party Slate](/wiki/party-slate).

| Item | Value |
| --- | --- |
| Verdict cutoff | Above +5 For, below -5 Against, otherwise Abstain |
| Each force | Held between -100 and +100 |
| Party whip | 30 soft, 60 hard, times compliance |
| Party line | 20 times compliance |
| Hard whip check | 55 + 15 + 0.35 x loyalty - 0.18 x stubbornness, held at 40 to 95 |
| State bills: district / donors weights | 1.35 / 0.65 |

Live in every world and country with legislatures. The extra steps for autonomy level 6 are on [NPP Autonomy](/wiki/npp-autonomy). Last checked 2026-10-30, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html)
`;
