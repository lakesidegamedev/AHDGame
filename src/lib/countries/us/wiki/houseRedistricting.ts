export const usHouseRedistrictingContent = `# US House Redistricting & Gerrymandering

## In short

When district-based House elections are in play, **US House elections resolve per congressional district** instead of statewide proportional allocation. Each district has its own lean derived from a 16-square voter map. Maps are rebuilt neutrally at each decennial census. In a census year, the **governor** of a state whose party also holds the state legislature (a **trifecta**) may redraw the map once, but only where state law puts the pen in the legislature's hands, and only within the compactness and fairness caps that state law sets. Drawing past the fairness ceiling is illegal; a live map that ends up past it costs approval.

Redistricting decides how your voters are grouped into House seats. Whoever controls the pen in a census year can turn the same statewide vote into more or fewer seats, so it matters to every party and to every player who runs for the House.

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
| Campaign Here boost | +2.5 per action (+1.25 for an allied party), cap 7.5, decays 0.5 per turn |

## When redistricting happens

- **The census** fires in the first week of every year ending in 0. It reapportions the 435 House seats between states and rebuilds the district maps of every state whose seat count changed. States under an independent commission are also rebuilt neutrally at every census.
- **A redraw** is only allowed **in the census year itself**, and **once per census** per state. Outside a census year the editor refuses to save.
- Seat changes and any redraw take effect for the next House cycle in that state.

## District maps

Each state's House delegation is represented as **N districts × 16 squares**. Every square is tagged **left**, **right**, or **grey** (swing). District lean comes from the square mix: a district heavy on right squares is safer for Republicans; packed left or right squares create lopsided seats.

House races in a redistricted state run **one election per district**. Candidates compete for a single seat using the same vote-accumulation engine as other races, but the underlying electorate is the district's lean, not the whole state average.

## Who can draw maps

Map authority depends on **state legislation** (three policy levers):

| Law | Options | Effect |
| --- | --- | --- |
| **Redistricting authority** | Independent commission / Bipartisan commission / Legislature-drawn | Only legislature-drawn maps can be gerrymandered by the trifecta holder; commissions block partisan draws |
| **Compactness** | Strict / Moderate / Loose | Caps how far any district's lean may deviate from the state mean |
| **Fairness** | Strict / Moderate / Loose | Caps the statewide **efficiency gap** (a measure of wasted votes across districts) |

Both gates apply to a save: the acting character must be the **governor** of the state, and the governor's party must hold **more than half** of the state legislature's seats (a **trifecta**). Independent and bipartisan commissions refuse every proposed map outright. Independent-commission states are additionally reset to a neutral map at each census.

The three tiers as the code sets them:

| Tier | Max deviation from state mean | Packed districts allowed | Efficiency-gap ceiling |
| --- | --- | --- | --- |
| Strict | 4 | none | 10% |
| Moderate (default) | 8 | up to one third of districts | 20% |
| Loose | 12 | up to half of districts | 35% |

Deviation is measured in net squares (right minus left) against the state average. If the state's natural balance makes even the fairest possible map exceed the fairness ceiling, the ceiling is relaxed to the best achievable gap, so a state can always be drawn to its own lean but never beyond it.

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

- Drag squares between districts manually.
- Apply **auto-map strategies** within legal caps: Competitive (maximize toss-ups), Fair (low efficiency gap), Lean Left, Lean Right, Max Left and Max Right.
- Review a **composition summary**: seat lean breakdown, compactness indicators, and efficiency-gap readout before committing.

Committed maps take effect for the next House cycle in that state.

## How a district decides its seat

Each party's statewide vote total is the baseline. In a district, that baseline is scaled by the district's lean: a party on the right side of a right-leaning district is boosted, the other side is cut, and a 16-0 district is a guaranteed seat. Grey squares lean nowhere. The highest-scoring party takes the seat.

## Gerrymandering in practice

A gerrymander is a legal map that spends the state's squares unevenly: pack the other side into a few lopsided districts and spread your own voters thinly across the rest. The compactness tier limits how lopsided any one district can be, the packed-district limit caps how many of those you can build, and the efficiency gap caps how much of the state's vote you can waste in total. At Strict the tools barely move seats; at Loose a leaning state can sweep and a balanced one can swing about three seats.

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

District-level races mean **ground game and ads target a smaller electorate**. Statewide popularity still matters, but winning a gerrymandered map often requires contesting the handful of grey or lightly leaning districts rather than running up margins everywhere.

**Campaign Here.** While redistricting is enabled, a party can spend political strength (base cost 2) to boost its score in one district. Each action adds 2.5 points for a candidate's own party and half that for an allied party, capped at 7.5, and the boost decays by 0.5 each turn.

## What you can do

- **Governor in a census year, with your party holding the legislature (a trifecta):** open the state's **Redistrict** page under the region and redraw once, by hand or with an auto-map strategy.
- **Anyone:** propose state bills that change the redistricting authority, compactness or fairness law (see [Bills & Legislation](/wiki/bills-legislation)).
- **Any party member with political strength:** use Campaign Here on a district during a House race.
- **Everyone else:** watch the state's approval breakdown for an unfair-map penalty.

Tips:

- Check the law first. If the state uses a commission, no one can draw a partisan map.
- A map that stays under the fairness ceiling costs no approval, so push exactly to the ceiling and no further.
- You get one redraw per census, so use the auto-map preview to compare strategies before you save.

## Connections

**Driven by**

- [Bills & Legislation](/wiki/bills-legislation): state laws set who draws the map, and the compactness and fairness tiers.
- [Demographics](/wiki/demographics): state voter texture feeds each district's starting lean.

**Affects**

- [Election Mechanics](/wiki/election-mechanics): in a redistricted state each House seat is resolved district by district.
- [General Elections](/wiki/general-elections): district leans set which seats are close in the closing sprint.
- [Government Approval](/wiki/government-approval): an unfair map lowers that state's approval by 2 to 5 points.

## Status

Live for the US House in worlds that run district-by-district House elections. In other worlds, and in other countries, House seats are allocated statewide and this page does not apply.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact tiers, legality checks and approval penalty are on the [Elections design page](https://docs.lakesidegames.net/design/elections.html).
`;
