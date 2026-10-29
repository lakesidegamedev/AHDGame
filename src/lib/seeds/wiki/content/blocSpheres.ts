export const blocSpheresContent = `# Bloc Alignment & Spheres of Influence

Every nation is pulled toward the great-power blocs of its era. That pull is called **alignment**. It decides which nations can join a bloc, which are drifting away from it, and which patron a nation counts as belonging to, its **sphere**. If you play a foreign minister or a member of a bloc, this is the board you are fighting over.

## How it works

Alignment is the cause, sphere membership is the effect.

1. **Shares.** Every nation carries a share from 0 to 100 toward each pole in the current era, plus an uncommitted remainder. All shares and the remainder always add up to 100. The gap between a nation's top pole and its next-highest is its **lead**.
2. **Movement.** Shares move a little each turn by passive drift, and move more when a bloc pays for an influence play or sends aid.
3. **Thresholds.** A nation that holds a share past a threshold for long enough can join or leave a bloc.
4. **Sphere.** A nation counts as belonging to a patron only once its lead clears the commitment gate.

The poles depend on the year. From 1945 to 1990 there are two, West (NATO channel) and East (Warsaw Pact channel). From 1991 there are three, Washington (NATO at full weight, the EU at 0.6), Moscow and Beijing. When the game crosses into a new era, every nation's shares are re-mapped onto the new poles once. A pole with a declared successor hands its share across. A pole with none returns its share to the uncommitted pool.

### Key numbers

| Item | Value |
| --- | --- |
| Join a bloc | Share in that bloc's pole of 60 or more |
| Heading for the exit | Share of 40 or less |
| Deadband (nothing happens) | 41 to 59 |
| Time a threshold must be held | 24 turns, half a game year |
| Locked (immune to drift) | Lead of 85 or more |
| Non-aligned band (drifts at half rate) | Lead of 20 or less |
| Lead needed for a sphere | 50 in a two-pole era, 40 in a three-pole era |
| Passive drift cap per nation | 5 points a turn, or 7.5 if the nation has an open crisis |
| Passive pull from membership | 0.04 points a turn per unit of channel weight, up to a ceiling of 67 |
| Cost of one point from an influence play | 0.1% of the target's annual GDP, times the channel weight |
| Biggest single play | 10 points |
| Smallest play | 0.01 points |
| Bloc stress cut | Plays work at 1 minus 0.4 times stress, so never below 60% |
| Stress labels | Settled below 0.25, Strained below 0.6, Overextended at 0.6 or more |
| Diplomatic actions per country per turn | 4 (used by membership proposals) |

\`\`\`wiki-chart
alignment-membership-thresholds
\`\`\`

### Why membership alone cannot lock a nation

Passive membership pull stops at 67. Getting a nation past that and toward the locked line of 85 needs deliberate plays. This is on purpose: a bloc has to keep paying for the nations it wants, not just collect members. A locked nation cannot be moved by drift at all, and a play against one is refused before any money is spent.

### Bloc stress

A bloc's own cohesion is a separate 0 to 1 gauge. An alliance that grabs half the map should not defend all of it as well as a compact one. Stress is built from three things about the bloc's members:

| Part | Weight | Counts as |
| --- | --- | --- |
| Contested | 0.45 | A member where a rival pole holds a share of 25 or more |
| Wants out | 0.35 | A member that has held a share of 40 or less for 24 turns |
| Digesting | 0.20 | A member that joined in the last 12 turns |

Each part is the fraction of members affected. Raw member count is not an input, so a large settled bloc is not penalised for its size. Stress falls by itself as contested members settle and new members are absorbed. The digesting cost is a transition cost, not a permanent tax.

### Worked example

**A nation joins a bloc.** In 1955 a nation sits at West 63, East 25, uncommitted 12.

- Its share in the West pole is 63, above the join line of 60. It can apply to NATO once it has held that for 24 turns.
- Its lead is 63 minus 25 = 38, below the 50 needed in a two-pole era. It can join the bloc and still have no sphere.
- Membership alone pulls it by 0.04 a turn, so it would take about 100 turns to climb from 63 to the ceiling of 67.

**An influence play.** The target has annual GDP of 20 billion. One point costs 0.1% of that, 20 million, times channel weight 1 for NATO.

- Spending 60 million buys 3 points.
- Spending 140 million buys 7 points but only 5 land that turn. The overflow is lost.
- Spending 200 million buys the single-play maximum of 10 points, and 5 still land.

**Bloc stress.** A 10-member bloc has 3 contested members, 2 wanting out and 1 that joined last turn: 0.45 times 0.3 + 0.35 times 0.2 + 0.20 times 0.1 = 0.225. That is Settled, and its plays work at 1 minus 0.4 times 0.225 = 91%. If 6 are contested, 4 want out and 3 are digesting, stress is 0.27 + 0.14 + 0.06 = 0.47 (Strained), which is 81%.

## What you can do

- **See where nations stand.** Open **World > International Organizations**, pick a bloc, then the **Influence** tab. It shows pole shares, targets and the bloc stress label.
- **Commit an influence play.** A member of the bloc spends the organization's pooled fund to pull a target toward the bloc's pole. It is queued, and the turn processes it with the same caps as drift. A play can reach any nation.
- **Pay aid.** Aid can only go to a member and needs a member vote. The recipient drifts toward the paying bloc, priced against its own economy. Aid keeps the clients you hold, plays win new ones.
- **Propose membership.** A nation at or above 60 may be proposed. Proposals use one of the country's 4 diplomatic actions each turn.

Tips:

- Watch your stress label before pushing in many new members. Recent accessions and contested members blunt your bloc's plays.
- A member in the 41 to 59 band is not at risk yet. Do not spend a play to save it.
- A member below 40 for 24 turns is a real defection risk and will show in your stress gauge.
- Spending past 5% of a target's GDP in one turn is wasted, because 5 points a turn is the cap.
- Opposing pulls on different poles cancel before the cap, so a rival's counter-play can undo yours. Only the net direction counts.

### Common questions

- **How do I move a nation into my sphere?** Pay for plays and aid until its lead clears the sphere gate (50 or 40). Passive membership alone stops at share 67.
- **Why was my ally flagged as wanting out?** Its share in your pole has been at or below 40 for 24 turns.
- **What does Overextended do?** Your bloc's plays work at 76% or less, and never below 60%.
- **What happens when a member defects?** The sustained wants-out signal feeds your bloc's stress and can trigger a defection crisis for that nation. An open crisis raises the nation's movement cap while it lasts.

## Connections

**Driven by**

- [International Organizations](/wiki/international-organizations): membership gives a passive pull, and the pooled fund pays for plays and aid.
- [Crisis Interaction](/wiki/crisis-interaction): an open flashpoint raises a nation's per-turn movement cap from 5 to 7.5.

**Affects**

- [International Organizations](/wiki/international-organizations): a share of 60 or more allows joining, 40 or less flags a member as heading out.

## Status

Live in every world that has the Cold War era layer. Poles and channels depend on the in-game year: two poles from 1945 to 1990, three from 1991.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules, constants and source files: [Bloc alignment and spheres](https://docs.lakesidegames.net/design/bloc-alignment-and-spheres.html).
`;
