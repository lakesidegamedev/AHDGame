export const nppAutonomyContent = `# NPP Autonomy

When a cabinet seat sits empty in a country nobody plays, or a company has no CEO, something has to fill it. **NPP autonomy** is the ladder that decides how much Non-Player Politicians do on their own: sponsoring bills, forming governments, staffing ministries and running campaigns without waiting for a player. A world sits on one level: **off, v0, v1, v2, v3, v4, v5 or v6**. A fresh world is seeded at **v4**, except new singleplayer and simulation worlds, which start at **v6**. Hosted worlds that ran v4 or v5 were raised to **v6** by a one-time update shipped with engine 6. In multiplayer you do not set the level; the world's setting decides it. In singleplayer you pick it when you start a game. You can read its effects in NPP-led governments, caretaker ministers and vacant-company CEOs.

The level says which activities NPPs may perform in a world. How well the shipped code performs them is the **NPP engine version**, recorded with every change in the [NPP changelog](/changelog/npp). For the baseline NPP rules, see [NPPs Overview](/wiki/npps-overview), [NPP Behavior](/wiki/npp-behavior) and [NPP Elections](/wiki/npp-elections).

## The ladder

Levels are cumulative: v2 includes v0 and v1, and v6 includes everything below it.

| Level | What NPPs gain | What you may notice |
| --- | --- | --- |
| **off** | Reactive cross-pressure voting and elections only | NPPs only react; nothing is proposed by them |
| **v0** | Bill sponsorship, international organization votes and a stalled prime minister filled in countries nobody plays; a caretaker central bank chair in any country except the US when no eligible player is available | Empty top jobs get filled |
| **v1** | Executive formation, ministerial governance and governing agendas; government agenda bills, opposition rival bills and opposition bloc voting | NPP-led cabinets act coherently instead of sponsoring one-off bills |
| **v2** | **Comingle tier**: caretaker ministers, caretaker CEOs for vacant corporations, NPP corporate attacks | NPPs staff vacant ministries and companies even where players play |
| **v3** | NPP savings earn interest and NPPs bargain in unions; in countries nobody plays, NPPs invest in bonds and shares, build party organisation and found companies; a second same-party NPP can challenge in primaries | NPPs have money and compete harder |
| **v4** | The v3 economic actions in every country, and bill sponsorship in player countries too, under a tighter cap (the seeded default) | Wider NPP activity in markets and legislatures |
| **v5** | A government keeps standing goals (three, or two on easy and five on hard singleplayer), grades them, and lets the results steer its next agenda; seated NPPs age and die, and successors replace them | Governments stay on a consistent course |
| **v6** | Engine 6: the same resources as v5, with better decisions and lower running cost | Smarter candidate placement, rallies, vote counting before sponsoring, government whips, opposition that picks its battles, presidential primary challengers in countries nobody plays |

![Cumulative ladder from off to v6 showing what each level adds, with player countries acting only from v2 upward.](/wiki-images/diagrams/npp-autonomy-ladder.svg)

## Where it applies

- **Countries nobody plays:** the world's level applies as-is, from v0 to v6.
- **Player countries:** autonomy only acts at **v2 and above**. Below v2 it counts as off there, so humans stay in charge of countries people actually play. A few things never reach a player country at any level: the stalled prime minister fill, international organization votes and NPP presidential entry. Bill sponsorship reaches them only from v4. The caretaker central bank chair is the one exception the other way: it can be seated in a player country at any level above off.

A world is set to v3. In a country nobody plays, NPP sponsorship, cabinets, savings, union bargaining, investing and primary challengers all run. In a country players play, the same level counts as v3 and acts, because it is above v2, but NPPs there sponsor no bills until v4. At v1, the first country would still see sponsorship and cabinets, but the player country would see no NPP autonomy beyond a caretaker central bank chair.

From v1, NPP prime ministers and presidents form cabinets, and v0 fills stalled prime minister seats ([Government Formation](/wiki/government-formation)). v6 adds presidential challengers where no player plays ([NPP Elections](/wiki/npp-elections)).

## What v6 changes

v6 changes how well NPPs pursue the v5 activities and what they cost to run each turn. It does not give them more money or action points. In practice:

- parties run their strongest NPPs for their most senior races, and ambitious incumbents step up to open senior seats in their home region
- NPP candidates hold rallies in their own race at most once every four turns
- an NPP counts the likely votes before filing a bill and sets aside one that would fail, trying the next best; tax rate bills are filed without a count ([NPP Behavior](/wiki/npp-behavior))
- an NPP-led government puts a soft whip on its own NPP members for its bills that serve its standing goals; it never whips a party with a player chair or vice chair, and any explicit whip replaces it ([Voting & Whips](/wiki/voting-and-whips), which is also how you steer how NPPs vote)
- the opposition votes as a bloc only against a government it could actually defeat
- central banks answer and defend currency moves
- votes can be shaped by business interests, which voters can see and mark down

| Item | Value |
| --- | --- |
| Levels | off, v0, v1, v2, v3, v4, v5, v6 |
| Level seeded in a new world | v4 |
| Lowest level that acts in a player country | v2 |
| Standing goals a v5 government keeps | 3 (2 easy, 5 hard singleplayer) |
| NPP rally frequency (v6) | One every 4 turns |

Depends on the world: other worlds keep the level they were set to. Last checked 2026-10-30, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html) and each engine change in the [NPP changelog](/changelog/npp)
`;
