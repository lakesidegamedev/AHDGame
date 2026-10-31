export const playerEventsContent = `# Player Random Events

A tax audit lands on your desk. Or a lottery win, a staffer scandal, a donor with dirty money. Every so often the game hands your character a short personal choice, the dice decide how well it goes, and the result can change your wealth, reputation or standing. Nothing here is permanent: favorability and wealth swings are meaningful but not game-ending. They put a cost on neglect and a reward on preparation, because your stats nudge the roll.

## Being offered an event

Each turn the game runs one pass over player characters.

1. Any event past its deadline is resolved for you on its default option, and you are notified.
2. If you are in an election debate this turn, you are skipped. Debates take priority over normal events, which is how [RPG Stats & Debates](/wiki/rpg-stats) interacts with this system.
3. If you already have a pending event, you are skipped. You never hold more than one.
4. If you are still on your spacing cooldown, you are skipped.
5. The game keeps the events that fit you: your role, your country and the in-game year. There is no separate cooldown per event, so the same event can come up again once your spacing cooldown ends.
6. It picks one from that list by weight. An event with weight 20 is twice as likely as one with weight 10.
7. You are offered the event and notified through the [Notification Center](/wiki/notifications). A dice roll from 1 to 100 is fixed at that moment.

![The checks each turn that decide whether a character is offered a random event, with a branch for shared broadcast moments that skip the spacing cooldown.](/wiki-images/diagrams/player-events-offer-pipeline.svg)

| Item | Value |
| --- | --- |
| Pending events per character | 1 |
| Spacing cooldown after an event resolves | 10 to 20 turns, rolled again each time |
| Time to answer | 48 turns or 24 real hours, whichever comes first |
| Options per event | Usually 2 to 4, one is the default |
| Broadcast events | At most one per turn, each at most once per world |

The turn clock in [Core Systems](/wiki/core-systems) sets the cooldowns and deadlines. If you do not respond in time you take the default, and the spacing cooldown starts as if you had answered.

### Who gets which event

| Tag | Who it reaches |
| --- | --- |
| Everyone | Any character |
| Politician | Anyone who holds office or is in an active election |
| CEO | Anyone running a corporation |
| In an election | Anyone with an active candidacy |
| Concentrated CEO | A CEO who owns more than 65% of their company (very concentrated: more than 80%) |

Holding office ([Elections](/wiki/elections-player-guide)) or running a company ([Corporations](/wiki/corporations)) widens your pool, because politicians and CEOs get extra events on top of the everyone events. Some events also exclude certain roles, such as a sitting president being called for jury duty, and some are limited to certain countries.

An event can have an earliest and latest in-game year. That keeps anachronisms out (no "your campaign went viral" in 1953). Decade events only fire in their own decade, 1950s through 1990s. Country events carry era flavor, such as coronation street parties in 1953 UK or Trabant deliveries in the DDR. The [Random Events browser](/wiki/random-events) lists the approved events and who is eligible.

## When the dice are rolled

When you choose, the roll is nudged by your stat and then checked against three outcome tiers. Options show their primary stat, and raising it improves your roll.

| Item | Value |
| --- | --- |
| Outcome tiers (typical) | Low roll 1 to 39, middle 40 to 79, high 80 to 100 |
| Stat adjustment | Plus or minus 4 roll points for each point your stat is above or below 5.5, rounded |
| Roll limits after adjustment | 1 to 100 |

Say you have Intellect 7.5 and the game offers **Tax Audit**, an "Everyone" event. The roll fixed at offer is 33.

- **Cooperate fully** uses Intellect. Adjustment: (7.5 minus 5.5) times 4 = +8, so the effective roll is 41. That is the middle tier, "Minor discrepancies": 50,000 less personal wealth.
- With Intellect 5.5 the same roll stays 33: the low tier, "Back taxes owed": 150,000 less wealth and 2 favorability lost.
- **Stonewall the auditors** uses no stat. On the same roll 33 it hits the low tier, "Criminal referral": 400,000 less wealth, 8 favorability lost and 6 infamy gained.
- **Ignore the notice** is the default. If you let the deadline pass, the default option resolves on your roll.

\`\`\`wiki-chart
event-roll-stat-adjustment
\`\`\`

The roll is fixed when the event is offered, so a good stat shifts you toward a better tier but never guarantees one. If an option costs money you cannot afford, the default is not automatically the safe choice: in Tax Audit the default is "Ignore the notice", which carries a 120,000 wealth loss on a middle roll.

Every resolution posts a notification with the tier you landed in, and notable outcomes can also reach the wire. Favorability is your personal standing with voters and feeds your results in [Election Mechanics](/wiki/election-mechanics).

## Moments everyone shares

Some events are shared historic moments delivered to every eligible character at once, in the year they happened:

| Moment | Year | Who |
| --- | --- | --- |
| Moon landing | 1969 | Every country |
| Kennedy assassination | 1963 | United States |
| Chernobyl | 1986 | Russia and the DDR |
| Fall of the Berlin Wall | 1989 | Every country |
| Millennium night | 1999 | Every country |

A broadcast ignores your spacing cooldown. If you have a pending event, it is resolved on its default option so the moment can land. A broadcast fires once per world, so if your world never plays through that year, or a character is created after it, you never see it. That is the answer to "why did I never get the moon landing?" The same offer and cooldown machinery runs at country level in [World Events](/wiki/world-events).

Runs in current worlds for player characters. Content depends on the in-game year, your country, your role, and whether the world plays through a broadcast year. Last checked 2026-10-29, version 1.18.0. A dedicated technical page has not been written yet; the numbers above are the exact rules, and the turn clock they run on is in [Core Systems (design)](https://docs.lakesidegames.net/design/core-systems.html)
`;
