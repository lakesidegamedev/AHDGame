export const scotusContent = `# Supreme Court (SCOTUS)

Nine seats, appointed by the President and confirmed by the Senate, and a Court dominated by one ideological bloc costs the country democratic health. The Supreme Court exists only in the United States. A justice seat gives you extra actions, a national influence tier and two court-only actions, and it does **not** use up your other office: you can sit on the Court and still be a Senator, governor or private citizen.

## Who sits on the bench

Each seat is held by a player, an NPP or a scripted historical justice, or is vacant. Each era begins with its Original Roster. When an original justice reaches their authored departure year, the seat becomes vacant. Replacements are not automatic: the President nominates and the Senate confirms every one, by simple majority with the same seat-weighted vote as cabinet confirmation (see [Confirmation Process](/wiki/confirmation-process)). Whips shape NPP senators' votes on nominees (see [Voting & Whips](/wiki/voting-and-whips)).

After the first appointment, a sitting justice can leave mid-term, whether player or NPP. The President and the occupant are notified when a seat opens. The Court does not keep a confirmed player forever.

![A Supreme Court seat cycles from vacant to nominated, Senate vote, seated, and back to vacant on departure.](/wiki-images/diagrams/scotus-seat-lifecycle.svg)

- **As President:** nominate a justice to any vacant seat.
- **As a senator:** vote to confirm or reject, and whip your party's NPPs.
- **As a candidate for a seat:** there is no application. The President chooses, so build relationships with the President and senators, as for any cabinet post. You become a justice by being nominated and confirmed.

## The docket

Curated historical cases resolve against the sitting Court, on the calendar year the world shows rather than the raw turn counter. A majority on the case's tagged axis can diverge from the historical outcome, and a divergence can enact policy through the same pipeline as a bill (see [Bills & Legislation](/wiki/bills-legislation)). An evenly split bench (4-4, or no seated majority) reaches no decision: the case affirms the existing outcome. Surprise cases can also fire. They are non-historical and resolve the turn they appear, using the sitting majority.

## What a seat gives you

| Item | Value |
| --- | --- |
| Seats | 9 |
| Confirmation | Simple majority of the Senate, 24 hour vote |
| Extra actions per turn | +2, stacking on any other office |
| National influence tier | 1.5 (the cabinet tier; tiers do not stack, you get the highest) |
| Justice action pool | Cap 2, regain 1 every 12 turns |
| Buy one extra action | 10 action points, once per turn, never above the cap |
| Write an Opinion | 1 justice action, +0.5 national influence |
| Public Address | 1 justice action, +2 favorability |
| Court-concentration penalty | 0 at 6-3; about 4 at 7-2; 8 at 8-1; 12 at 9-0 (needs 5 or more seated) |

Use the **Write an Opinion** or **Public Address** actions from the justice office page. Each spends one justice action. A seat is an excellent second job since it stacks with other offices; the 12 turn accrual means one action every half day, so use the two-action pool before it fills. A justice's appointment is recorded in their career history. Two achievements recognise the Court: being confirmed to it, and dying in office as a sitting justice.

## Packing the Court

A Court filled by one side removes a check on the other branches. The penalty makes packing a trade-off instead of a free win.

Each seated justice is scored by their average lean on the economic and social axes: below -1 is liberal, above +1 is conservative, in between is a swing justice. Swing justices still count in the total, so neither bloc can claim them. If a justice's lean is unknown, their appointing party is used instead. The penalty to the country's democratic health score is 0 until one bloc passes two-thirds of the bench, then grows to a cap of 12 points for a bench of one bloc. A Court with fewer than 5 seated justices is too empty to score. Vacant seats do not count.

\`\`\`wiki-chart
court-concentration-penalty
\`\`\`

The bench has 9 seated justices and a conservative bloc of 7. That is 7/9 = 77.8% of the bench. The penalty is ((0.778 - 0.667) / 0.333) x 12 = 4.0 points. The President nominates an eighth conservative to fill the last liberal seat: the bloc is 8/9 = 88.9%, and the penalty rises to 8.0. A 6-3 bench costs nothing because 6/9 is exactly two-thirds, not over it.

Live in the United States in every era. A justice seat is not a cabinet office and is not gated by year the way HUD or Homeland Security are. No other country has an equivalent Court.

Last checked 2026-10-29, version 1.18.0. Exact rules: the numbers on this page are the full rule set; the nomination vote shares its rules with the cabinet vote on the [Cabinet design page](https://docs.lakesidegames.net/design/cabinet.html)
`;
