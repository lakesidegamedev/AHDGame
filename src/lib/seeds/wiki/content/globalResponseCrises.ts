export const globalResponseCrisesContent = `# Global Response Crises

Global Response Crises are long-running international situations such as Vietnam, the Berlin and Congo crises, pandemics and nuclear alerts. Each one opens a series of decisions for the governments involved. What you choose is remembered, and the damage it causes lingers after the decision window closes. They matter because your choices move [global tension](/wiki/cold-war-tension), your treasury, your standing with other governments and sometimes whether a real war breaks out.

Open the system at [World Conflicts](/world/conflicts). The page separates three things:

- **Global tension** shows how dangerous the whole international system is.
- **Response campaigns** show the active situations and their current stage.
- **Shooting wars** show conflicts where military units can actually fight.

They affect each other but are not the same. A proxy campaign can exist before it opens a shooting war. A nuclear buildup can raise tension without any battlefield.

## How it works

A campaign moves through five stages. Between your decisions, the stage slowly pushes its damage tracks up or down every turn.

| Stage | What it means | Change per turn |
| --- | --- | --- |
| Posture | Governments assess the situation and set an opening position. | None |
| Mobilization | Aid, forces, logistics and covert networks begin to move. | Arms proliferation +0.4, regional spillover +0.2 |
| Operations | Active campaign, human and strategic costs grow. | Civilian strain +0.7, refugees +0.4, infrastructure damage +0.45, casualties +0.6, regional spillover +0.25, settlement momentum +0.15 |
| Settlement | Pressure moves toward an end state. | Civilian strain -0.35, refugees -0.15, settlement momentum +0.5 |
| Aftermath | Emergency pressure falls, lasting damage recovers slowly. | Civilian strain -0.5, refugees -0.25, infrastructure damage -0.15, regional spillover -0.2, settlement momentum -0.25 |

Your own decisions and the authored outcomes add one-off jumps on top of this drift. A campaign also records its cycle and turns in the current stage, so a later response window continues the history instead of starting blank.

### Key numbers

| Item | Value |
| --- | --- |
| Response window (most campaigns) | 24 turns, which is 24 hours of real time |
| Response window (pandemic) | 12 turns |
| Consequence tracks and country memory | 0 to 100 each |
| Tension bands | Detente 0 to 14.9, Calm 15 to 34.9, Elevated 35 to 59.9, Crisis 60 to 79.9, Brink 80 to 100 |
| Tension floor: baseline | 12 |
| Tension floor: Vietnam escalation | 4 per rung, capped at 30 |
| Tension floor: active response campaigns | 3 each, capped at 12 |
| Tension floor: world warheads | 1.2 times the square root of total warheads, capped at 18 (reached at 225 warheads) |
| Tension movement toward the floor | 8% of the gap per turn, doubled when the floor is above the reading |

### Why the game remembers your choices

Each country keeps its own memory: credibility, war weariness, military commitment, humanitarian commitment and covert exposure, plus the last response and commitment type. A government that repeatedly commits forces ends up in a different position from one that funds relief or stays out. The memory exists so a crisis is a story over many windows instead of a string of unrelated pop-ups. The same response cannot be applied twice, even if you submit it twice.

### Capacity and locked options

An option can need a treasury large enough, military readiness, logistics, domestic support, intelligence confidence, or the right campaign stage. A locked option lists every unmet requirement, in the form "Needs logistics" followed by the minimum. The server checks your live country state again when you submit, so an old browser tab cannot bypass a capability you lost.

Briefings are not equal. Your role, intelligence confidence and the campaign exposure decide how much detail you see. Covert options hide intent, but covert exposure builds up, and exposed covert action costs credibility later.

### Global tension

Discrete events (escalation, nuclear tests, crisis outcomes) move the reading immediately. Between events it drifts toward a pressure floor, which adds up the standing sources of danger:

- A baseline of 12.
- Vietnam escalation, active campaigns and the world warhead stockpile, as in the table above.
- Every active shooting war, weighted by intensity. A war with nuclear-armed countries on opposite sides holds the floor at Crisis on its own for as long as it burns. A long war that stays below hot intensity sheds part of that shock after twelve turns, but never below a substantial residual.

The page shows each driver, the floor, and whether the reading is rising or easing toward it. Declaring a war also spikes the reading immediately: most for a war between nuclear powers, less for any other interstate war, least for the rest. Tension then sets the displayed DEFCON posture, strategic procurement pressure and the detente goodwill penalty.

### Worked example

A world is in 1966 with Vietnam at rung 3, two active response campaigns, no shooting war, and 400 warheads in total.

- Baseline: 12
- Vietnam: 3 rungs times 4 = 12
- Campaigns: 2 times 3 = 6
- Warheads: 1.2 times the square root of 400 (20) = 24, capped at 18

The floor is 12 + 12 + 6 + 18 = 48, which is Elevated. If the reading sits at 30, it climbs toward 48 at double speed: 16% of the 18-point gap, about 2.9 points, on the first turn. A nuclear test then pushes it up at once, and the floor stops it from ever relaxing below 48 while those pressures last.

At that rung, deepening the commitment costs 0.15% of smoothed GDP (0.0005 times the rung, three rungs). Covert support costs 60% of that, 0.09%. Holding the line is free.

## What you can do

- **Answer a window.** The head of state of a country with a role in the campaign picks an option from the card on **World Crises** or your actions page. The International Response Desk on **World Conflicts** lists every open campaign. A card marked "National" means your government owns its own choice. The effects still spread past your border.
- **Check why an option is locked.** The card names each unmet requirement. Build up the named capability, or wait for the right stage.
- **Manage the nuclear programme.** Defence ministers run it in the Defence Office. The conventional Nuclear Delivery doctrine unlocks the tree. Device nodes need public tests, delivery nodes are adopted quietly. A stockpile with no delivery leg has no deterrence.
- **Lower tension.** Choose de-escalating options in campaigns, avoid tests, and end wars. Relief cannot cross the floor, so the standing causes (warheads, wars, open campaigns) have to shrink first.

Tips:

- Cheap holds are often right early. Costs and political damage scale with the rung, so a deep commitment late is much more expensive than the same choice early.
- Covert options are cheaper but build exposure. Use them when you can afford the credibility loss if they leak.
- If you cannot answer, the cautious default resolves for you. Activity is your lever, not a requirement.

### Common questions

- **How long do I have?** 24 turns (24 real hours) for most campaigns, 12 turns for the pandemic.
- **What does the default do?** Each role has a cautious authored option. In Vietnam it is "Hold the line" for the United States and "Maintain support" for the Soviet Union, so your commitment stays where it is. The campaign continues and can open another window later.
- **Does a Vietnam escalation drag me into war?** No. At the air-campaign rung the system can open a real North Vietnam versus South Vietnam conflict, but the superpowers stay patrons unless another mechanic makes them belligerents. Pulling support below that rung winds the front down. Reaching zero closes the chain permanently.
- **Who answers?** Each country with a role answers separately. One government's response does not close another's window.
- **Is there a negotiation mini-game?** No. Settlement comes from campaign state, accumulated consequences and authored outcomes.

The nuclear alert campaign cannot open until at least two countries have both warheads and an adopted delivery system, so an empty world cannot invent a superpower standoff. The United States, Soviet Union or Russia and United Kingdom receive scaled historical baseline programs at world creation, with zero automatic production, so growth still needs a defence decision and budget.

## Connections

**Driven by**

- [Nuclear Programme](/wiki/nuclear-programme): warheads raise the tension floor, and tests spike the reading.
- [Conflicts & the Military System](/wiki/conflicts-overview): active shooting wars hold the tension floor up.
- [Cold War Tension](/wiki/cold-war-tension): the shared reading sets which options and pressures apply.
- [National Doctrine](/wiki/national-doctrine): the Nuclear Delivery doctrine unlocks the nuclear tree that feeds the floor.
- [Crisis Interaction](/wiki/crisis-interaction): response windows use its decision cards and treasury checks.

**Affects**

- [Cold War Tension](/wiki/cold-war-tension): outcomes and escalation move the reading and the floor.
- [Defence Procurement](/wiki/defence-procurement): tension raises strategic procurement demand.
- [Conflicts & the Military System](/wiki/conflicts-overview): high escalation can open a real shooting war.
- [Crisis Interaction](/wiki/crisis-interaction): chained campaigns advance through its decision system.

## Status

Live in every world that has the Cold War and conflict layers, with the campaign families available from the year each one begins: Berlin 1958, Congo 1960, Suez 1956, oil disruption 1956, nuclear alert 1957, Vietnam 1955, Yugoslav dissolution 1991, Northern Ireland 1991, terrorism 1998, global financial crisis 2007, Arab uprisings 2010, Russia-Ukraine 2013 and the pandemic 2018. A world set in an earlier era only sees the families that have started by its current year.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules, constants and source files: [Global response crises (as shipped)](https://docs.lakesidegames.net/design/global-response-crises-as-shipped.html).
`;
