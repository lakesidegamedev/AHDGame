export const nppAutonomyContent = `# NPP Autonomy

**NPP autonomy** is the ladder that decides how much Non-Player Politicians do on their own: sponsoring bills, forming governments, staffing ministries and running campaigns without waiting for a player. A world sits on one level: **off, v0, v1, v2, v3, v4, v5 or v6**. A fresh world is seeded at **v4**, except new singleplayer and simulation worlds, which start at **v6**. The live multiplayer world has run **v6** since game version 1.16.

The level says which activities NPPs may perform in a world. How well the shipped code performs them is the **NPP engine version**, recorded with every change in the [NPP changelog](/changelog/npp). For the baseline NPP rules, see [NPPs Overview](/wiki/npps-overview), [NPP Behavior](/wiki/npp-behavior) and [NPP Elections](/wiki/npp-elections).

## How it works

Levels are cumulative: v2 includes v0 and v1, and v6 includes everything below it.

| Level | What NPPs gain | What you may notice |
| --- | --- | --- |
| **off** | Reactive cross-pressure voting and elections only | NPPs only react; nothing is proposed by them |
| **v0** | Autonomous party organization votes; fills stalled executive seats in countries nobody plays (central bank chair, stalled prime minister) | Empty top jobs get filled |
| **v1** | Autonomous bill sponsorship and voting, executive formation, ministerial governance and governing agendas | NPP-led cabinets act coherently instead of sponsoring one-off bills |
| **v2** | **Comingle tier**: caretaker ministers, caretaker CEOs for vacant corporations, NPP corporate attacks | NPPs staff vacant ministries and companies even where players play |
| **v3** | Savings, union bargaining and campaign finance run like player accounts; NPPs challenge for presidential primaries in countries nobody plays | NPPs have money and compete harder |
| **v4** | Economic actions at global scope and deeper autonomous bill sponsorship (the seeded default) | Wider NPP activity in markets and legislatures |
| **v5** | A government keeps up to five standing goals, grades them, and lets the results steer its next agenda; NPPs age, retire and are replaced | Governments stay on a consistent course |
| **v6** | Engine 6: the same activities and resources as v5, with better decisions and lower running cost | Smarter candidate placement, vote counting before sponsoring, government whips, opposition that picks its battles |

### Player and non-player countries

- **Countries nobody plays:** the world's level applies as-is, from v0 to v6.
- **Player countries:** autonomy only acts at **v2 and above**. Below v2 it counts as off there, so humans stay in charge of countries people actually play.

### What v6 changes

v6 changes how well NPPs pursue the v5 activities and what they cost to run each turn. It never changes what they may do or how much money and action points they get. In practice:

- parties run their strongest NPPs for their most senior races
- ambitious incumbents step up to open senior seats in their home region
- NPP candidates hold rallies in their own race at most once every four turns
- an NPP counts the likely votes before filing a bill, and does not file one that would fail
- an NPP-led government whips its own members on bills that serve its goals; it never whips a party a player leads
- the opposition votes as a bloc only against a government it could actually defeat
- central banks answer and defend currency moves
- votes can be shaped by business interests, which voters can see and mark down

### Key numbers

| Item | Value |
| --- | --- |
| Levels | off, v0, v1, v2, v3, v4, v5, v6 |
| Level seeded in a new world | v4 |
| Lowest level that acts in a player country | v2 |
| Standing goals a v5 government keeps | Up to 5 |
| NPP rally frequency (v6) | One every 4 turns |

### Worked example

A world is set to v3. In a country nobody plays, NPP savings, union bargaining and presidential challenges all run. In a country players play, the same level counts as v3 and acts, because it is above v2. At v1, the first country would still see sponsorship and cabinets, but the player country would see no NPP autonomy at all.

## What you can do

You do not set the level. You can read the effects: NPP-led governments, caretaker ministers and vacant-company CEOs are autonomy at work. Use [Voting & Whips](/wiki/voting-and-whips) and party NPP work to steer how NPPs vote, and read the [NPP changelog](/changelog/npp) for every engine change and what is planned.

## Connections

**Driven by** nothing a player can switch; the world's setting decides the level.

**Affects**

- [NPPs Overview](/wiki/npps-overview): the level decides what NPPs do on their own beyond voting and running.
- [NPP Behavior](/wiki/npp-behavior): from v6 NPPs count votes before sponsoring and governments whip their own members.
- [NPP Elections](/wiki/npp-elections): v3 and above add presidential challengers where no player plays, and v6 changes placement and career moves.
- [Government Formation](/wiki/government-formation): from v1, NPP prime ministers and presidents form cabinets, and v0 fills stalled prime minister seats.
- [Voting & Whips](/wiki/voting-and-whips): government whips under v6 sit alongside player whips.

## Status

Depends on the world. The live multiplayer world runs v6. New singleplayer and simulation worlds start on v6; other worlds keep the level they were set to. In player countries autonomy acts only from v2 up.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html), and each engine change is listed in the [NPP changelog](/changelog/npp).
`;
