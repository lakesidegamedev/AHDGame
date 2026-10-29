export const nppAutonomyContent = `# NPP Autonomy

When a cabinet seat sits empty in a country nobody plays, or a company has no CEO, something has to fill it. **NPP autonomy** is the ladder that decides how much Non-Player Politicians do on their own: sponsoring bills, forming governments, staffing ministries and running campaigns without waiting for a player. A world sits on one level: **off, v0, v1, v2, v3, v4, v5 or v6**. A fresh world is seeded at **v4**, except new singleplayer and simulation worlds, which start at **v6**. The live multiplayer world has run **v6** since game version 1.16. You do not set the level; the world's setting decides it. You can read its effects in NPP-led governments, caretaker ministers and vacant-company CEOs.

The level says which activities NPPs may perform in a world. How well the shipped code performs them is the **NPP engine version**, recorded with every change in the [NPP changelog](/changelog/npp). For the baseline NPP rules, see [NPPs Overview](/wiki/npps-overview), [NPP Behavior](/wiki/npp-behavior) and [NPP Elections](/wiki/npp-elections).

## The ladder

Levels are cumulative: v2 includes v0 and v1, and v6 includes everything below it.

| Level | What NPPs gain | What you may notice |
| --- | --- | --- |
| **off** | Reactive cross-pressure voting and elections only | NPPs only react; nothing is proposed by them |
| **v0** | Autonomous party organization votes; seats a caretaker central bank chair in any country except the US when no player is nominated; fills a stalled prime minister in countries nobody plays | Empty top jobs get filled |
| **v1** | Autonomous bill sponsorship and voting, executive formation, ministerial governance and governing agendas | NPP-led cabinets act coherently instead of sponsoring one-off bills |
| **v2** | **Comingle tier**: caretaker ministers, caretaker CEOs for vacant corporations, NPP corporate attacks | NPPs staff vacant ministries and companies even where players play |
| **v3** | Savings, union bargaining and campaign finance run like player accounts; NPPs challenge for presidential primaries in countries nobody plays | NPPs have money and compete harder |
| **v4** | Economic actions at global scope and deeper autonomous bill sponsorship (the seeded default) | Wider NPP activity in markets and legislatures |
| **v5** | A government keeps up to five standing goals, grades them, and lets the results steer its next agenda; NPPs age, retire and are replaced | Governments stay on a consistent course |
| **v6** | Engine 6: the same activities and resources as v5, with better decisions and lower running cost | Smarter candidate placement, vote counting before sponsoring, government whips, opposition that picks its battles |

![Cumulative ladder from off to v6 showing what each level adds, with player countries acting only from v2 upward.](/wiki-images/diagrams/npp-autonomy-ladder.svg)

## Where it applies

- **Countries nobody plays:** the world's level applies as-is, from v0 to v6.
- **Player countries:** autonomy only acts at **v2 and above**. Below v2 it counts as off there, so humans stay in charge of countries people actually play.

A world is set to v3. In a country nobody plays, NPP savings, union bargaining and presidential challenges all run. In a country players play, the same level counts as v3 and acts, because it is above v2. At v1, the first country would still see sponsorship and cabinets, but the player country would see no NPP autonomy at all.

From v1, NPP prime ministers and presidents form cabinets, and v0 fills stalled prime minister seats ([Government Formation](/wiki/government-formation)). v3 and above add presidential challengers where no player plays ([NPP Elections](/wiki/npp-elections)).

## What v6 changes

v6 changes how well NPPs pursue the v5 activities and what they cost to run each turn. It never changes what they may do or how much money and action points they get. In practice:

- parties run their strongest NPPs for their most senior races, and ambitious incumbents step up to open senior seats in their home region
- NPP candidates hold rallies in their own race at most once every four turns
- an NPP counts the likely votes before filing a bill, and does not file one that would fail ([NPP Behavior](/wiki/npp-behavior))
- an NPP-led government whips its own members on bills that serve its goals; it never whips a party a player leads, and these sit alongside player whips in [Voting & Whips](/wiki/voting-and-whips), which is also how you steer how NPPs vote
- the opposition votes as a bloc only against a government it could actually defeat
- central banks answer and defend currency moves
- votes can be shaped by business interests, which voters can see and mark down

| Item | Value |
| --- | --- |
| Levels | off, v0, v1, v2, v3, v4, v5, v6 |
| Level seeded in a new world | v4 |
| Lowest level that acts in a player country | v2 |
| Standing goals a v5 government keeps | Up to 5 |
| NPP rally frequency (v6) | One every 4 turns |

Depends on the world: other worlds keep the level they were set to. Last checked 2026-10-29, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html) and each engine change in the [NPP changelog](/changelog/npp)
`;
