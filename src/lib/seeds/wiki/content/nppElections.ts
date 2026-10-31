export const nppElectionsContent = `# NPP Elections

Step into a primary and every NPP in it scores at half. That is the quickest lever a player has over NPP candidates, because you cannot choose which NPP runs. NPPs enter primaries and general elections on their own every turn, and they are the opponents you face when no other player is in the race. Party chairs can ask specific NPPs to run, and a player in the race makes every NPP candidate weaker.

## Getting on the ballot

Each turn, during the NPP phase, an NPP enters a primary only while it is **open and accepting candidates**. To enter, an NPP must:

- not be retired
- not be on cooldown for that race
- not already be a candidate in another race
- have its home state (or region, Land or prefecture) match the race
- be in the same country as the race
- be in a party that does not already have a candidate in that primary
- be in a party with a local organisation in that state, where the state has party organisation data

Those are the usual reasons an NPP is not running: it is retired, on cooldown, running elsewhere, homed in a different state, blocked by a same-party candidate, its party has no presence there, or the primary has closed. Technocrats never run, and in a one-party state only parties allowed to field candidates can. Ambition, home state and party decide which race it picks ([NPPs Overview](/wiki/npps-overview)), and the primary rules govern entry, handicaps and late withdrawals ([primaries](/wiki/primaries)).

**Presidential races are closed to NPPs** in any country that players can play in, except the first round of a Russian presidential election. In a country nobody plays, where NPP autonomy is on, NPPs can enter the presidential primary. Leadership races for the US Speaker and floor leaders are for players only.

Entry happens in two phases:

1. **Incumbents.** An NPP that holds the seat being contested re-enters to defend it before anyone else. It ignores that seat's cooldown and its party's regional presence.
2. **Everyone else.** Open slots are filled from NPPs of each party homed in the state, **one generic NPP per party per primary**. Races are filled in this order, so a party short of NPPs leaves the later ones empty: state senate, regional councils, other regional assemblies, Sangiin, House, Grand National Assembly, Commons, Senate and Senato, Shugiin, delegates to national congresses and soviets, and finally governor. Race types not on the list come last. Presidential and other nationwide executive primaries are filled before this pass.

From autonomy level 3, a second same-party NPP can also enter a primary that has exactly one candidate from its party, as a challenger.

![Each turn NPPs pass eligibility checks, incumbents defend first, accepted slate filings join, then generic fill adds one NPP per party per primary.](/wiki-images/diagrams/npp-elections-entry-flow.svg)

## Asking an NPP to run

A party's national or state chair or vice chair can put a same-party NPP homed in that state on the **Slate** for a race, at no cost. The board is the [Party Slate](/wiki/party-slate), with a limit of 3 candidates per party per race, players and NPPs together. The NPP accepts if its loyalty is at least 40 and its stubbornness is at most 70 (state and regional leaders get 5 points of leeway on each). An accepted NPP can join a primary even if a same-party candidate is already in it. The board shows "Likely to Accept" or "Likely to Decline" before the turn and the result after.

As a rank and file member you cannot stop an NPP running. Enter the race to make it a weaker candidate, or ask a party chair to act. An NPP leaves a primary if a chair withdraws its filed slate row, if a chair slates a compliant NPP into a different race, or if the world uses autonomy level 6 and it trails badly in a primary with no player in it. Below level 6 an NPP never leaves a race because its appeal is low. One that withdraws at level 6 stays out of that race until the primary ends.

## Facing one

| When | Effect |
| --- | --- |
| A **player** is in the same party primary | NPP primary scores are multiplied by **0.5** |
| A **player** is in the general election | NPP candidates get **80%** of the vote weight they would otherwise get |
| No player in the race | No penalty |

A primary score of 60 for an NPP becomes 30. In a general election, if a player and an NPP would each have drawn 50 units of support from a group, the NPP counts as 40, and the player takes about **55.6%** of that group against **44.4%**.

To beat one in a primary, stay close to your party and state positions (see [Party Ideology](/wiki/party-ideology)). NPPs have no campaign in the race, so they cannot run race ads or canvass. Their own campaign, advertise and fundraise actions only raise their general influence, favorability and funds, and below autonomy level 6 nothing moves their race Support. To beat one in a [general election](/wiki/general-elections), where NPP candidates carry that 80% weight against players, build your party's Org in the state (it weighs every candidate of that party, so it helps most against an NPP from another party), and target the voter groups an NPP does not appeal to.

NPPs start at a **Political Influence of 10** and decay never takes them below 10. New player characters start at no less than 10, so a new player does not begin behind every rival. A player's influence can still fall below 10 if neglected.

## Autonomy level 6

In worlds on autonomy **V6**, parties run their strongest NPPs for the biggest races (a party weak across the region puts them in its most local races instead), ambitious single-seat incumbents step up to open senior seats at home, NPP candidates hold rallies (at most one every four turns, paid with the NPP's own campaign action and moving Support as much as a player rally), and in the last 12 turns of a primary with no player in it, a non-incumbent NPP below 60% of its party's strongest candidate withdraws instead of splitting the vote. Primaries with a player in them are never touched. The world's level also adds challengers and career moves, see [NPP Autonomy](/wiki/npp-autonomy).

| Item | Value |
| --- | --- |
| NPP primary score with a player in the race | x 0.5 |
| NPP general election vote weight with a player in the race | x 0.8 |
| Political Influence floor | 10 |
| Slate acceptance | Loyalty at least 40 and stubbornness at most 70 |
| NPPs per party per primary (generic fill) | 1 |
| Slate limit per party per race | 3 |
| V6 rally frequency | One every 4 turns |

Live in every world and country with elections. Presidential entry is limited to countries nobody plays, where NPP autonomy is on. Last checked 2026-10-30, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html)
`;
