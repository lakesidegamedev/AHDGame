export const usHouseRedistrictingContent = `# US House Redistricting & Gerrymandering

## In short

When district-based House elections are in play, **a state's House seats are assigned to its congressional districts**. The statewide vote still decides how many seats each party wins (proportionally, by largest remainder above the House threshold); the district map decides which districts each party's seats land in. Each district has its own lean derived from a 16-square voter map. At each decennial census, states whose seat count changed (and independent-commission states) get a fresh neutral map. In a census year, the **governor** of a state whose party also holds the state legislature (a **trifecta**) may redraw the map once, but only where state law puts the pen in the legislature's hands, and only within the compactness and fairness caps that state law sets. Drawing past the fairness ceiling is illegal; a live map that ends up past it costs approval.

Redistricting decides how your voters are grouped into House seats. Whoever controls the pen in a census year decides which districts each party's seats come from, and so which of a party's nominees take them, so it matters to every party and to every player who runs for the House. It does not change how many seats the statewide vote earns.

## Key numbers

| Item | Value |
| --- | --- |
| Squares per district | 16 |
| When a redraw is allowed | The census year only (years ending in 0), once per census per state |
| Maximum deviation from state mean (Strict / Moderate / Loose) | 4 / 8 / 12 net squares |
| Packed districts allowed (Strict / Moderate / Loose) | none / one third / half |
| Efficiency-gap ceiling (Strict / Moderate / Loose) | 10% / 20% / 35% |
| A packed district | 12 or more of its 16 squares in one color |
| Approval penalty for a map over its ceiling | 2 to 5 points |
| Campaign Here cost | 2 political strength (base) |
| Campaign Here boost | +2.5 per action when the acting officer is a candidate in the race (+1.25 otherwise), cap 7.5, decays 0.5 per turn |

\`\`\`wiki-chart
redistricting-tier-limits
\`\`\`

## When redistricting happens

- **The census** fires in the first week of every year ending in 0. It reapportions the 435 House seats between states and rebuilds the district maps of every state whose seat count changed. While redistricting is switched on, states under an independent commission are also rebuilt neutrally at every census.
- **A redraw** is only allowed **in the census year itself**, and **once per census** per state. Outside a census year the editor refuses to save.
- A redraw applies when the state's next House race resolves, even a race that is already running, because resolution reads the live map.

## District maps

Each state's House delegation is represented as **N districts × 16 squares**. Every square is tagged **left**, **right**, or **grey** (swing). District lean comes from the square mix: a district heavy on right squares is safer for Republicans; packed left or right squares create lopsided seats.

A redistricted state still runs **one statewide House race** on the normal vote-accumulation engine. At resolution the statewide result sets each party's seat count, and the district map then decides which districts those seats are placed in and which nominee holds each one.

## Who can draw maps

Map authority depends on **state legislation** (three policy levers):

| Law | Options | Effect |
| --- | --- | --- |
| **Redistricting authority** | Independent commission / Bipartisan commission (default) / Legislature-drawn | Only legislature-drawn maps can be redrawn by the trifecta holder; commissions block partisan draws |
| **Compactness** | Strict / Moderate / Loose | Caps how far any district's lean may deviate from the state mean |
| **Fairness** | Strict / Moderate (default) / Loose | Caps the statewide **efficiency gap** (a measure of wasted votes across districts) |

Both gates apply to a save: the acting character must be the **governor** of the state (when the governor is computer-run, the governor's state party chair or vice chair acts for the office), and the governor's party must hold **more than half** of the state legislature's seats (a **trifecta**). Independent and bipartisan commissions refuse every proposed map outright. Independent-commission states are additionally reset to a neutral map at each census.

The three tiers as the code sets them:

| Tier | Max deviation from state mean | Packed districts allowed | Efficiency-gap ceiling |
| --- | --- | --- | --- |
| Strict | 4 | none | 10% |
| Moderate (default) | 8 | up to one third of districts (rounded up) | 20% |
| Loose | 12 | up to half of districts (rounded up) | 35% |

Deviation is measured in net squares (right minus left) against the state average. If the state's natural balance makes even the fairest possible map exceed the fairness ceiling, the ceiling for saving is relaxed to the best achievable gap, so a state can always be drawn to its own lean but never beyond it. The approval penalty below still measures against the law's own ceiling.

![Gates a House map must pass before it saves: census year, governor, trifecta, legislature authority, compactness, packed districts and efficiency gap.](/wiki-images/diagrams/us-house-redistricting-gates.svg)

## Drawing rules

Proposed maps must satisfy all active caps:

- Each district totals exactly **16 squares** (no negative counts).
- Statewide square totals are **conserved**: you redistribute voters, not invent them.
- **Per-district deviation**: no district may lean more than the compactness tier allows away from the state mean.
- **Packed districts**: districts with 12 or more of their 16 squares in one color count toward the packed-district limit.
- **Efficiency gap**: the statewide gap between wasted left and wasted right votes must stay below the fairness ceiling.

Illegal maps cannot be saved. Auto-map presets respect the same legality checks: strategies blocked by current law are disabled in the UI.

## Map editor tools

Trifecta holders use the state redistricting editor to:

- Paint squares left, right or grey by hand (click to cycle a square, or drag to paint several), keeping the state's totals unchanged.
- Apply **auto-map strategies** within legal caps: Competitive (maximize toss-ups), Fair (low efficiency gap), Lean Left, Lean Right, Max Left and Max Right.
- Review a **composition summary**: seat lean breakdown, compactness indicators, and efficiency-gap readout before committing.

A committed map is used by the next House race in that state to resolve.

## How a district decides its seat

First, the statewide vote gives each party a seat quota by largest remainder, after the House threshold. Then each party's strength in each district is its statewide vote scaled by the district's lean: a right-pool party is boosted in a right-leaning district and cut in a left-leaning one, grey squares lean nowhere, and a Campaign Here boost adds on top. Districts go to the strongest party that still has quota left, so a party fills its quota with the districts that suit it best. Within a party, the won districts go to its nominees by primary share.

## Gerrymandering in practice

A gerrymander is a legal map that spends the state's squares unevenly: pack the other side into a few lopsided districts and spread your own voters across the rest. Because seat counts come from the statewide vote, a gerrymander changes which districts each party holds (and which of its nominees win), not how many seats it gets. The compactness tier limits how lopsided any one district can be, the packed-district limit caps how many of those you can build, and the efficiency gap caps how unevenly the state's squares can be spread in total.

**The approval cost.** A live map whose efficiency gap exceeds the state's fairness ceiling carries a per-state approval penalty until the map is corrected. The penalty is 2 points plus 1 more for every full 5 points of efficiency gap over the ceiling, capped at 5. It is labelled as an unfair congressional map on the approval breakdown.

| Efficiency gap over the ceiling | Approval penalty |
| --- | --- |
| Under 5 points | 2 |
| 5 to under 10 points | 3 |
| 10 to under 15 points | 4 |
| 15 points or more | 5 |

**Worked example.** A Moderate state (ceiling 20%) is drawn with a 33% efficiency gap. That is 13 points over, so the state takes a 4 point approval penalty. The same map in a Loose state (ceiling 35%) is under its ceiling and costs nothing. In a Moderate state a single district may lean at most 8 net squares from the state mean, so if the state averages even, 11 right, 3 left and 2 grey squares (net 8) is the most lopsided district you can draw.

Why the rule exists: the tiers let each state choose how much a trifecta can bend the map, and the approval penalty gives a cost to a map the voters would call unfair, so a gerrymander is a trade-off and not a free win.

## Campaign effects

Because each party's seat count comes from its statewide vote, **running up your party's statewide share is what wins more seats**. The map and Campaign Here decide where those seats land, which matters most to the individual nominees competing for the friendliest districts.

**Campaign Here.** While redistricting is enabled and a House race is open in the state, a party officer (its state or national chair, vice chair or campaigner) can spend the party's political strength (base cost 2) to boost the party's score in one district. Each action adds 2.5 points when the officer is a candidate in that race and half that otherwise, capped at 7.5, and the boost decays by 0.5 each turn. It changes which districts the party's seats are placed in, not how many it wins.

## What you can do

- **Governor in a census year, with your party holding the legislature (a trifecta):** open the state's **Redistrict** page under the region and redraw once, by hand or with an auto-map strategy.
- **State legislators (or a party chair directing one of the party's legislators):** propose state bills that change the redistricting authority, compactness or fairness law (see [Bills & Legislation](/wiki/bills-legislation)).
- **Party officers (chair, vice chair or campaigner):** use Campaign Here on a district during a House race.
- **Everyone else:** watch the state's approval breakdown for an unfair-map penalty.

Tips:

- Check the law first. If the state uses a commission (the default is a bipartisan one), no player can redraw the map.
- A map that stays under the fairness ceiling costs no approval, so push exactly to the ceiling and no further.
- You get one redraw per census, so use the auto-map preview to compare strategies before you save.

## Connections

**Driven by**

- [Bills & Legislation](/wiki/bills-legislation): state laws set who draws the map, and the compactness and fairness tiers.
- [Demographics](/wiki/demographics): sets who votes statewide; each district's starting squares come from the state's party registration, with independents and unregistered voters as grey.

**Affects**

- [Election Mechanics](/wiki/election-mechanics): in a redistricted state the statewide House result is placed into districts seat by seat.
- [General Elections](/wiki/general-elections): the statewide count sets each party's seats, and district leans decide which nominees take them.
- [Government Approval](/wiki/government-approval): an unfair map lowers that state's approval by 2 to 5 points.

## Status

Live for the US House in worlds with district-based House elections switched on (off by default). In other worlds, and in other countries, House seats are allocated statewide and this page does not apply.

Last checked: 2026-10-30, version 1.18.0

## Technical detail

The exact tiers, legality checks and approval penalty are on the [Elections design page](https://docs.lakesidegames.net/design/elections.html).
`;
