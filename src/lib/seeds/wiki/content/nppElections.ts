export const nppElectionsContent = `# NPP Elections

NPPs enter primaries and general elections on their own every turn. They are the opponents you face when no other player is in the race. You cannot choose which NPP runs, but party chairs can ask specific NPPs to run, and a player in the race makes every NPP candidate weaker.

## How it works

### Who can enter a race

Each turn, during the NPP phase, an NPP enters a primary only while it is **open and accepting candidates**. To enter, an NPP must:

- not be retired
- not be on cooldown for that race (see below)
- not already be a candidate in another race
- have its home state (or region, Land or prefecture) match the race
- be in the same country as the race
- be in a party that does not already have a candidate in that primary

**Presidential races are closed to NPPs** in any country that players can play in. In a country nobody plays, where NPP autonomy is on, NPPs can enter the presidential primary. Leadership races for the US Speaker and floor leaders are for players only.

### Two phases: incumbents first

1. **Incumbents.** An NPP that holds the seat being contested re-enters to defend it before anyone else. It ignores that seat's cooldown.
2. **Everyone else.** Open slots are filled from NPPs of each party homed in the state, **one generic NPP per party per primary**, so an NPP never splits its own party's vote. An NPP takes the most junior office it is eligible for first. The order is: state senate, regional councils, other lower assemblies, Sangiin, House, Commons, Senate, Shugiin, delegates to national assemblies, and finally governor.

![Each turn NPPs pass eligibility checks, incumbents defend first, accepted slate filings join, then generic fill adds one NPP per party per primary.](/wiki-images/diagrams/npp-elections-entry-flow.svg)

### Slate: asking an NPP to run

A party's national or state chair or vice chair can put a same-party NPP on the **Slate** for a race. The NPP accepts if its loyalty is at least 40 and its stubbornness is at most 70 (state and regional leaders get 5 points of leeway on each). An accepted NPP can join a primary even if a same-party candidate is already in it. The Slate board shows "Likely to Accept" or "Likely to Decline" before the turn and the result after. See [Party Actions](/wiki/party-actions).

### How an NPP is weakened by a player

| When | Effect |
| --- | --- |
| A **player** is in the same party primary | NPP primary scores are multiplied by **0.5** |
| A **player** is in the general election | NPP candidates get **80%** of the vote weight they would otherwise get |
| No player in the race | No penalty |

A primary score of 60 for an NPP becomes 30. In a general election, if a player and an NPP would each have drawn 50 units of support from a group, the NPP counts as 40, and the player takes about **55.6%** of that group against **44.4%**.

### Dropping out

NPPs do not leave a race just because their appeal is low. An NPP leaves a primary if a chair slates it into a different race in the same state, or if the primary is NPP-only and the world uses autonomy level 6 (see below). An NPP that withdraws stays out of that race until the primary ends.

### NPP influence

NPPs start at a **Political Influence of 10** and never go below 10. New player characters also start at 10, the same floor, so a new player does not begin behind every rival. A player's influence can still fall below 10 if neglected.

### Autonomy level 6

In worlds on autonomy **V6**, parties run their strongest NPPs for the biggest races, ambitious incumbents step up to open senior seats at home, NPP candidates hold rallies (at most one every four turns, at a player's cost and effect), and in an NPP-only primary a candidate far behind the party's best withdraws instead of splitting the vote. Primaries with a player in them are never touched. The live world runs V6; see [NPP Autonomy](/wiki/npp-autonomy).

### Key numbers

| Item | Value |
| --- | --- |
| NPP primary score with a player in the race | x 0.5 |
| NPP general election vote weight with a player in the race | x 0.8 |
| Political Influence floor | 10 |
| Slate acceptance | Loyalty at least 40 and stubbornness at most 70 |
| NPPs per party per primary (generic fill) | 1 |
| V6 rally frequency | One every 4 turns |

## What you can do

- **Enter early.** If you are in a primary, NPPs there score at half.
- **Ask for a candidate.** As a party chair or vice chair, slate the NPP you want in a race.
- **Beat them in a primary.** Stay close to your party and state positions (see [Party Ideology](/wiki/party-ideology)). NPPs cannot run ads, canvass or raise funds; you can. See [Primaries](/wiki/primaries).
- **Beat them in a general election.** Build Org, which NPPs cannot spend on, and target the voter groups an NPP does not appeal to. See [General Elections](/wiki/general-elections).

**Common questions.**
- *Why is my NPP not running?* It is retired, on cooldown, running elsewhere, homed in a different state, blocked by a same-party candidate, or the primary has closed.
- *Can NPPs run for President?* Only in a country nobody plays, with NPP autonomy on.
- *Can I stop an NPP running?* No. Enter the race to make it a weaker candidate, or ask a party chair to slate it into a different race.

## Connections

**Driven by**

- [NPPs Overview](/wiki/npps-overview): ambition, home state and party decide which race an NPP enters.
- [Party Actions](/wiki/party-actions): Slate assignments move NPPs into races.
- [Party Slate](/wiki/party-slate): the board where chairs assign NPPs to races, with a 3 candidate limit per party.
- [NPP Autonomy](/wiki/npp-autonomy): the world's level adds challengers, career moves and primary consolidation.
- [primaries](/wiki/primaries): NPP entry, score handicaps and late withdrawals in primaries follow the primary rules.

**Affects**

- [Primaries](/wiki/primaries): NPP candidates fill the field and take a score penalty beside players.
- [General Elections](/wiki/general-elections): NPP candidates have 80% vote weight against players.

## Status

Live in every world and country with elections. Presidential entry is limited to countries nobody plays, where NPP autonomy is on. Autonomy level 6 behaviours apply only to worlds set to that level.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html).
`;
