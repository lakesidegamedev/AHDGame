export const blocSpheresContent = `# Bloc Alignment & Spheres of Influence

Which patron does a nation really belong to, and how much will it cost to change that? Every nation is pulled toward the great-power blocs of its era, and that pull is called **alignment**. It decides which nations can join a bloc, which are drifting away from it, and which patron a nation counts as belonging to, its **sphere**. If you play a foreign minister or a member of a bloc, this is the board you are fighting over.

![Cause chain from influence plays, aid, drift and organization pull into alignment shares, then lead, sustained shares, bloc membership and sphere, with bloc stress weakening later plays.](/wiki-images/diagrams/bloc-spheres-cause-chain.svg)

## Shares, leads and spheres

Alignment is the cause, sphere membership is the effect.

1. **Shares.** Every nation carries a share from 0 to 100 toward each pole in the current era, plus an uncommitted remainder. All shares and the remainder always add up to 100. The gap between a nation's top pole and its next-highest is its **lead**.
2. **Movement.** A bloc member's shares move a little each turn by passive drift, and any nation moves more when a bloc pays for an influence play or sends aid.
3. **Thresholds.** A nation that holds a share past a threshold for long enough can join or leave a bloc.
4. **Sphere.** A nation counts as belonging to a patron only once its lead clears the commitment gate.

The poles depend on the year. From 1945 to 1990 there are two, West (NATO channel) and East (Warsaw Pact channel). From 1991 there are three, Washington (NATO at full weight, the EU at 0.6), Moscow and Beijing. When the game crosses into a new era, every nation's shares are re-mapped onto the new poles once. A pole with a declared successor hands its share across. A pole with none returns its share to the uncommitted pool. A player-founded Bloc adds its own pole on top of the era's poles. The system runs while the International alignment feature gate is on, which it is by default.

### Joining, leaving and staying put

| Item | Value |
| --- | --- |
| Join a bloc | Share in that bloc's pole of 60 or more |
| Heading for the exit | Share of 40 or less |
| Deadband (nothing happens) | 41 to 59 |
| Time a computer-run nation holds a threshold before it acts | 24 turns, half a game year |
| Locked (immune to drift) | Lead of 85 or more |
| Non-aligned band (drifts at half rate) | Lead of 20 or less |
| Lead needed for a sphere | 50 with two poles, 40 with three, 35 with four or more |
| Movement cap per nation (drift and plays together) | 5 points a turn, or 7.5 if the nation has an open crisis |
| Passive pull from membership | 0.04 points a turn per unit of channel weight, up to a ceiling of 67 |

\`\`\`wiki-chart
alignment-membership-thresholds
\`\`\`

A share of 60 or more allows joining an [International Organization](/wiki/international-organizations), and 40 or less flags a member as heading out. A member in the 41 to 59 band is not at risk yet, so do not spend a play to save it. A member at 40 or less counts against your stress gauge at once, opens a defection crisis after 12 turns there, and after 24 turns a computer-run member walks out. A player-run member is only warned. Membership also gives a passive pull, and the organization's pooled fund pays for plays and aid.

Take a nation in 1955 at West 63, East 25, uncommitted 12.

- Its share in the West pole is 63, above the join line of 60. A player-run nation's foreign minister can apply to NATO now. A computer-run nation asks to join by itself once it has held 60 for 24 turns.
- Its lead is 63 minus 25 = 38, below the 50 needed in a two-pole era. It can join the bloc and still have no sphere.
- Membership alone pulls it by 0.04 a turn, so it would take about 100 turns to climb from 63 to the ceiling of 67.

Passive pull stops at 67, and that is on purpose: a bloc has to keep paying for the nations it wants, not just collect members. Getting past 67 toward the locked line of 85 needs deliberate plays. A locked nation cannot be moved by drift at all, and a play against one is refused before any money is spent.

## Moving a nation: plays and aid

Open **World > International Orgs**, pick a bloc, then the **Influence** tab. It shows pole shares, targets and the bloc stress label.

- **Commit an influence play.** A member of the bloc spends the organization's pooled fund to pull a target toward the bloc's pole. It is queued, and the turn processes it with the same caps as drift. A play can reach any nation.
- **Pay aid.** Aid can only go to a member and needs a member vote. The recipient drifts toward the paying bloc, priced against its own economy. Aid keeps the clients you hold, plays win new ones.
- **Propose membership.** A nation at or above 60 may be proposed. Proposals use one of the country's 4 diplomatic actions each turn.

| Item | Value |
| --- | --- |
| Cost of one point from an influence play | 0.1% of the target's annual GDP, divided by the channel weight |
| Biggest single play | 10 points |
| Smallest play | 0.01 points |
| Diplomatic actions per country per turn | 4 (used by membership proposals) |

Say the target has annual GDP of 20 billion. One point costs 0.1% of that, 20 million, at channel weight 1 for NATO.

- Spending 60 million buys 3 points.
- Spending 140 million buys 7 points but only 5 land that turn. The overflow is lost.
- Spending 200 million buys the single-play maximum of 10 points, and 5 still land.

Spending past 5% of a target's GDP in one turn is wasted, because 5 points a turn is the cap. Opposing pulls on different poles cancel before the cap, so a rival's counter-play can undo yours. Only the net direction counts. To move a nation into your sphere, pay for plays and aid until its lead clears the sphere gate (50 or 40).

If a member defects, the sustained wants-out signal feeds your bloc's stress and can trigger a defection crisis for that nation. An open flashpoint raises the nation's movement cap from 5 to 7.5 while it lasts; see [Crisis Interaction](/wiki/crisis-interaction).

## When a bloc overreaches

A bloc's own cohesion is a separate 0 to 1 gauge. An alliance that grabs half the map should not defend all of it as well as a compact one. Stress is built from three things about the bloc's members:

| Part | Weight | Counts as |
| --- | --- | --- |
| Contested | 0.45 | A member where a rival pole holds a share of 25 or more |
| Wants out | 0.35 | A member whose share is currently 40 or less |
| Digesting | 0.20 | A member that joined in the last 12 turns |

Each part is the fraction of members affected. Raw member count is not an input, so a large settled bloc is not penalised for its size. Stress falls by itself as contested members settle and new members are absorbed. The digesting cost is a transition cost, not a permanent tax, but watch your stress label before pushing in many new members.

| Item | Value |
| --- | --- |
| Bloc stress cut | Plays work at 1 minus 0.4 times stress, so never below 60% |
| Stress labels | Settled below 0.25, Strained below 0.6, Overextended at 0.6 or more |

A 10-member bloc has 3 contested members, 2 wanting out and 1 that joined last turn: 0.45 times 0.3 + 0.35 times 0.2 + 0.20 times 0.1 = 0.225. That is Settled, and its plays work at 1 minus 0.4 times 0.225 = 91%. If 6 are contested, 4 want out and 3 are digesting, stress is 0.27 + 0.14 + 0.06 = 0.47 (Strained), which is 81%. Overextended means plays work at 76% or less, never below 60%.

Poles and channels depend on the in-game year: two poles from 1945 to 1990, three from 1991. Last checked 2026-10-29, version 1.18.0. Exact rules: [Bloc alignment and spheres](https://docs.lakesidegames.net/design/bloc-alignment-and-spheres.html)
`;
