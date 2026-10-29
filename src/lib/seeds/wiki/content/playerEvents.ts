export const playerEventsContent = `# Player Random Events

Player random events are short personal choices the game offers your character from time to time: a tax audit, a lottery win, a staffer scandal, a donor with dirty money. You pick an option, the dice roll decides how well it goes, and the result can change your wealth, reputation or standing. They add risk and texture between elections and corporate decisions, and they reward characters who built the right stats.

## How it works

Each turn the game runs one pass over player characters.

1. Any event past its deadline is resolved for you on its default option, and you are notified.
2. If you are in an election debate this turn, you are skipped. Debates take priority over normal events.
3. If you already have a pending event, you are skipped. You never hold more than one.
4. If you are still on your spacing cooldown, you are skipped.
5. The game keeps the events that fit you: your role, your country, the in-game year, and the per-kind cooldown.
6. It picks one from that list by weight. An event with weight 20 is twice as likely as one with weight 10.
7. You are offered the event and notified. A dice roll from 1 to 100 is fixed at that moment.

![The checks each turn that decide whether a character is offered a random event, with a branch for shared broadcast moments that skip the spacing cooldown.](/wiki-images/diagrams/player-events-offer-pipeline.svg)

When you choose, the roll is nudged by your stat and then checked against three outcome tiers.

### Key numbers

| Item | Value |
| --- | --- |
| Pending events per character | 1 |
| Spacing cooldown after an event resolves | 10 to 20 turns, set per character |
| Time to answer | 48 turns or 24 real hours, whichever comes first |
| Options per event | Usually 2 to 4, one is the default |
| Outcome tiers (typical) | Low roll 1 to 39, middle 40 to 79, high 80 to 100 |
| Stat adjustment | Plus or minus 4 roll points for each point your stat is above or below 5.5, rounded |
| Roll limits after adjustment | 1 to 100 |
| Broadcast events | At most one per turn, each at most once per world |

### Who gets which event

| Tag | Who it reaches |
| --- | --- |
| Everyone | Any character |
| Politician | Anyone who holds office or is in an active election |
| CEO | Anyone running a corporation |
| In an election | Anyone with an active candidacy |
| Concentrated CEO | A CEO who owns more than 65% of their company (very concentrated: more than 80%) |

Some events also exclude certain roles, such as a sitting president being called for jury duty, and some are limited to certain countries.

### Era gating

An event can have an earliest and latest in-game year. That keeps anachronisms out (no "your campaign went viral" in 1953). Decade events only fire in their own decade, 1950s through 1990s. Country events carry era flavor, such as coronation street parties in 1953 UK or Trabant deliveries in the DDR.

### Broadcast events

Some events are shared historic moments delivered to every eligible character at once, in the year they happened:

| Moment | Year | Who |
| --- | --- | --- |
| Moon landing | 1969 | Every country |
| Kennedy assassination | 1963 | United States |
| Chernobyl | 1986 | Russia and the DDR |
| Fall of the Berlin Wall | 1989 | Every country |
| Millennium night | 1999 | Every country |

A broadcast ignores your spacing cooldown. If you have a pending event, it is resolved on its default option so the moment can land. A broadcast fires once per world, so if your world never plays through that year, or a character is created after it, you never see it. That is the answer to "why did I never get the moon landing?"

### Why do events exist

They put a cost on neglect and a reward on preparation. Nothing here is permanent: favorability and wealth swings are meaningful but not game-ending, and the stat nudge gives your character build a real effect.

### Worked example

You are a character with Intellect 7.5 and the game offers **Tax Audit**, a "Everyone" event. The roll fixed at offer is 33.

- **Cooperate fully** uses Intellect. Adjustment: (7.5 minus 5.5) times 4 = +8, so the effective roll is 41. That is the middle tier, "Minor discrepancies": 50,000 less personal wealth.
- With Intellect 5.5 the same roll stays 33: the low tier, "Back taxes owed": 150,000 less wealth and 2 favorability lost.
- **Stonewall the auditors** uses no stat. On the same roll 33 it hits the low tier, "Criminal referral": 400,000 less wealth, 8 favorability lost and 6 infamy gained.
- **Ignore the notice** is the default. If you let the deadline pass, the default option resolves on your roll.

\`\`\`wiki-chart
event-roll-stat-adjustment
\`\`\`

The roll is fixed when the event is offered, so a good stat shifts you toward a better tier but never guarantees one.

## What you can do

- **Answer the offer.** Each offer arrives as a notification in your Notification Center. Pick an option before the deadline.
- **Build the right stat.** Options show their primary stat. Raising it improves your roll. See [RPG Stats & Debates](/wiki/rpg-stats).
- **Read the outcome.** Every resolution posts a notification with the tier you landed in. Notable outcomes can also reach the wire.
- **Browse the templates.** The [Random Events browser](/wiki/random-events) lists the approved events and who is eligible.

Tips:

- If an option costs money you cannot afford, the default is not automatically the safe choice. In Tax Audit the default is "Ignore the notice", which carries a 120,000 wealth loss on a middle roll.
- Politicians and CEOs get extra events on top of the everyone events. Holding office or running a company widens your pool.
- If you do not respond in time you take the default, and the spacing cooldown starts as if you had answered.

## Connections

**Driven by**

- [RPG Stats & Debates](/wiki/rpg-stats): your stats nudge the roll, and a debate this turn blocks a normal offer.
- [Corporations](/wiki/corporations): running a corporation makes you eligible for CEO events.
- [Elections](/wiki/elections-player-guide): holding office or standing for election makes you eligible for politician and campaign events.
- [Core Systems](/wiki/core-systems): the turn clock sets cooldowns and deadlines.

**Affects**

- [Notification Center](/wiki/notifications): offers and outcomes arrive as notifications.
- [Government Approval](/wiki/government-approval): favorability changes feed your public standing.
- [World Events](/wiki/world-events): shares the same offer and cooldown machinery at country level.

## Status

Runs in current worlds for player characters. Content depends on the in-game year, your country, your role, and whether the world plays through a broadcast year.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

A dedicated technical page for this system has not been written yet. The numbers above are the exact rules. For the turn clock they run on, see [Core Systems](https://docs.lakesidegames.net/design/core-systems.html).
`;
