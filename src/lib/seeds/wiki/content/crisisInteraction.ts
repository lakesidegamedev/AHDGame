export const crisisInteractionContent = `# Crises

A bank fails, a flood hits a state, unemployment climbs for months, a war abroad drags in your trade partners. The game treats each of these as a crisis: a situation with a size, a stage and a list of people who can do something about it. You can wait it out or you can answer it, and the outcome depends on what the people in office actually do.

## What a crisis is

Every crisis has a **severity** from 0 to 100 and a **stage**. Severity is how bad it is right now. The stage is where it is in its life. Effects on [National Metrics](/wiki/national-metrics), [government approval](/wiki/government-approval), corporate profit margins and other systems scale with severity, so a crisis that is shrinking hurts less each turn and one that is growing hurts more.

Crises come from three places:

- **Scripted events.** Historical and authored shocks that fit the era of your world: wars, pandemics, financial panics, disasters. The long-running international campaigns in [Global Response Crises](/wiki/global-response-crises) are crises of this kind.
- **Disasters on a schedule.** Regional weather and natural disasters, timed per country and shaped by [climate pressure](/wiki/national-metrics).
- **Spread from other countries.** A crisis abroad can reach you through trade, finance, alliances, migration or climate. See below.

Crises are created by the game, never by players. Players decide how they end.

## The four stages

| Stage | What it means |
| --- | --- |
| Signal | Early warning. Severity is low but rising. This is the cheapest time to act. |
| Onset | The crisis has taken hold and its effects begin to bite. |
| Peak | Full strength. Effects are at their worst and every lever is on the table. |
| Aftermath | Severity is falling. Emergency pressure eases and recovery starts. A crisis can relapse to peak if severity jumps back up, but a crisis can only do this a limited number of times. |

When severity drops low enough the crisis is resolved and leaves the active list. A stage also has a minimum length, so a crisis does not skip straight from signal to peak unless severity surges well past the normal threshold. Each crisis type sets its own thresholds and stage lengths. Some crises, such as an authored disaster with a fixed duration, move through the stages on a set schedule instead of reacting to severity.

## What moves severity

Each turn severity changes by:

- **Drivers push it up.** These are real numbers from the simulation: unemployment, GDP growth, bank stress, how far safety-net spending or interest rates sit from where they should be. Prior policy matters here. A country that already runs a thin safety net or lets its banks run hot feeds the crises that exploit exactly that.
- **Responses push it down.** Every response (called a lever) removes severity points. There is a cap on how much can be removed in one turn, so stacking many responses has limits.
- **The stage itself.** Aftermath eases on its own, and some stages shed a little severity each turn.
- **Inaction pushes it up.** If nobody does anything meaningful for several turns in a row, the crisis starts feeding on itself. After a grace period it adds a growing amount each turn up to a ceiling. Token moves too small to count do not reset the clock.

## The "if nobody acts" forecast

Every crisis card shows a severity trend and a dashed line for the do-nothing projection: roughly where severity ends up if no one pulls a lever. It holds the current stage and driver pressure fixed, so read it as an estimate ("about"), not a promise. It is there so you can see what waiting costs before you decide.

## Keeping the load sane

The game limits how many crises run at once, by size. Local and state crises are cheap and common. A national crisis counts for far more, and a country will not carry more than about two at once. A world-scale crisis counts for most, and only a small number run at a time, spaced at least a day of turns apart. This keeps the world busy without burying everyone in cards.

## Who can act and what it costs

See [Crisis Responses](/wiki/crisis-responses) for the full list of offices, costs, the emergency bill and how your record is kept.

## How crises spread between countries

A crisis can travel along real links between countries. There are five channels: **trade**, **finance** (bond holdings), **alliance**, **migration** and **climate**. Each link says how much of the source crisis's severity passes on, and from what severity and stage it starts.

- A spread arrives with a delay, based on how the source looked a few turns earlier, so you usually get some warning.
- Heavier links pass on more. Light links do nothing.
- Spread either adds severity to a matching crisis already open in the other country, or opens a new one there.
- Smaller countries that run in the background do not simulate their own response, so their size is what counts. A large background country passes a shock on harder than a small one.
- A source crisis can only reach a few countries per link per turn.

Governments run by non-player parties answer too. Their head of government, finance minister and central bank chair pull the same executive levers a player would, in proportion to how bad the crisis is, how much their treasury and output can bear, and how willing that government is to intervene. They will not spend their approval into the floor to do it, and there is a cap on how many responses they make in a single turn. A seat held by a player is left to the player.

## The crises page, nav count and inbox

**World Crises** is the one place to see all of it. It opens on a world map. Hotspots are sized and colored by severity and type, and lines show crises that are spreading or that share a war. A side panel shows your personal exposure first: your state, your companies, the sectors you hold shares in, your office. Below the map, crises are grouped by what needs doing: needs a response, escalating, ongoing, winding down, history. You can filter to crises affecting you, conflicts, global, national, regional or debt watch. The old conflicts page now lands here.

Each crisis has a card with its stage track, severity trend with the do-nothing line, and the responses available to you inline. Open one for the detail page: where it stands, a **Who did what** log, and any **Lasting damage**. The same card appears on your actions page when you are in the crisis's scope.

- **Nav count.** The Crises item in the World menu shows how many crises you can currently do something about. Each crisis counts once, however many levers you hold on it.
- **Inbox alerts.** When a crisis in your country or state moves on to a new step you get a message in your inbox that links to the crisis. Alerts arrive on the next turn after the change, not instantly. See [Notifications](/wiki/notifications).

Last checked 2026-11-08, version 1.20.0. Exact rules: [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html)
`;
