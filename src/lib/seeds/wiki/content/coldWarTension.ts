export const coldWarTensionContent = `# Cold War Tension

The world shares one number: a tension gauge from 0 to 100 that sits at the top of the [Conflicts page](/world/conflicts). It is not your country's reading, or your rival's. It is the temperature of the whole standoff, and the readiness level, arms demand and diplomatic goodwill shown on the page all move with it.

## How it works

Tension has two parts. **Events** push it up in one-off spikes: a nuclear test, an escalation, a crisis. **Standing pressure** sets a floor underneath it, built from the world's arsenals, crises, escalation and shooting wars. Each turn the gauge closes 8% of the gap between itself and that floor. So spikes fade, but tension never falls below the floor.

![Flow from one-off events and standing pressure through spikes and the floor into tension from 0 to 100, which sets three dials and triggers domestic world events.](/wiki-images/diagrams/cold-war-tension-how-it-works.svg)

### Key numbers

| What | Value |
| --- | --- |
| Range | 0 to 100 |
| Baseline floor with nothing happening | 12 |
| Escalation rungs | +4 each, up to +30 |
| Active world crises | +3 each, up to +12 |
| Warheads in the world | +1.2 per square root of the total, up to +18 |
| Shooting wars | 0.12 per point of intensity, up to +45; a war between nuclear-armed countries holds at least 48 |
| Relaxation toward the floor | 8% of the gap per turn |
| Test spikes | Fission 9, Boosted 6, Thermonuclear 12, MIRV 10 |

## The five bands

| Band | Reading | What it feels like |
|---|---|---|
| DETENTE | below 15 | Genuine thaw. Summits, treaties, trade across the divide. |
| CALM | 15 to 34 | The ordinary cold war. Watchful, armed, stable. |
| ELEVATED | 35 to 59 | Incidents accumulate. Diplomats work late. |
| CRISIS | 60 to 79 | The world holds its breath. Miscalculation gets expensive. |
| BRINK | 80 and above | The final band. Nobody plans past it. |

The band label is what most of the world's machinery reacts to.

### A worked example

A world has 100 warheads, 2 active crises and an escalation level of 2. Its floor is 12 + 8 (escalation level 2, at 4 a rung) + 6 (two crises, at 3 each) + 12 (the square root of 100 is 10, times 1.2) = 38, which is ELEVATED. A thermonuclear test adds 12 and puts the gauge at 50. Each turn it closes 8% of the gap to 38: after one turn it is 49.0, after ten turns about 43.2, and after thirty about 39. If an extra war with intensity 50 breaks out, that adds 6 to the floor, and the gauge stays about 44.

\`\`\`wiki-chart
tension-after-thermonuclear-test
\`\`\`

## What raises it

- **Nuclear tests.** Every device test spikes tension, and bigger devices spike it harder. See [The Nuclear Programme](/wiki/nuclear-programme).
- **Escalation.** Climbing the rungs of an active proxy war raises the standing pressure, not just a one-off spike.
- **Crises.** Each active world crisis keeps the temperature up while it burns.
- **The world's arsenals.** The total warhead count across all programmes sets part of the floor. An armed world is a tense world even on a quiet week.
- **Shooting wars.** Every active war contributes according to its intensity. See [Conflicts & the Military System](/wiki/conflicts-overview) and [Declaring War](/wiki/declaring-war). A fresh war between nuclear-armed countries creates a crisis-grade shock. If a war stays limited for many turns, part of that initial panic slowly fades. Heating the war back up restores the full pressure at once, and an active conflict always leaves a substantial floor.

## What lowers it

- **Time.** With no new provocations, tension relaxes towards the floor.
- **Detente moves.** Deliberate de-escalation, stand-downs and diplomatic thaw apply relief directly.
- **Standing down.** Descending the escalation ladder and resolving crises lowers the floor.
- **Limited-war acclimation.** After twelve turns, a war that stays below hot-war intensity slowly sheds part of its initial public alarm. This never removes the war's residual danger, and escalation cancels the relief.

Spikes fade, but tension never falls below the floor set by how armed and embroiled the world actually is. If the arsenals are huge and a proxy war is hot, no amount of waiting reads as peace.

## What it does

Tension is a cause, not a scoreboard. The Conflicts page header turns the reading into three dials.

| Dial | How it is set |
| --- | --- |
| Readiness level (DEFCON) | 5 below 45, 4 from 45, 3 from 65, 2 from 85. Tension alone never reaches 1. |
| Arms demand multiplier | 1 plus 0.005 for every point above 12, so 1.25 at tension 62. |
| Detente goodwill penalty | 0.75 for every point above 35, so 20 at tension 62. |

Thaw is a resource, and a high penalty burns the goodwill that cooperative diplomacy needs.

High tension also brings **domestic world events**. Civil Defense Fever can start from tension 50. Panic Buying and War Scare Protests can start from 60. A Run on the Banks can start from 65. Governments can stagger them with spending, rationing, mobilization or emergency powers, but cannot suppress them completely. Strong measures shift demand away from consumer industries and toward manufacturing, construction and defence, while damaging civil liberties and Democratic Health.

## What you can do

You do not control the gauge. You contribute to it. A well-timed test, a rung of escalation, a crisis left to burn: each is a decision about the world's temperature, and the whole world pays the bill together. The powers that read the gauge best are the ones that choose when to be provocative, not the ones that are provocative by accident.

## Connections

**Driven by**

- [The Nuclear Programme](/wiki/nuclear-programme): each test spikes the gauge and the stockpile raises the floor.
- [Conflicts & the Military System](/wiki/conflicts-overview): every shooting war on the board raises the floor.
- [Declaring War](/wiki/declaring-war): a new war, especially between nuclear-armed countries, is a shock to the gauge.
- [Global Response Crises](/wiki/global-response-crises): campaign outcomes and escalation move the reading and the floor

**Affects**

- [Defence Procurement](/wiki/defence-procurement): the arms demand multiplier rises with tension.
- [Global Response Crises](/wiki/global-response-crises): the shared reading sets which pressures and options apply
- [World Events](/wiki/world-events): the gauge gates the four wartime society crises at 50, 60 and 65

## Status

The gauge runs in every world with the Cold War layer, which is the default. It reads the same whatever the era, but the arsenals that feed it exist only where a nuclear programme has been opened by the United States, the Soviet Union, the United Kingdom or East Germany.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact floor, relaxation and dial rules are on the design page [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html).

See also: [The Nuclear Programme](/wiki/nuclear-programme), [Conflicts & the Military System](/wiki/conflicts-overview), [Declaring War](/wiki/declaring-war).
`;
