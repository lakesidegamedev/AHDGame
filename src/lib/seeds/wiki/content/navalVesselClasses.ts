export const navalVesselClassesContent = `# Naval Vessel Classes & Standing Orders

## In short

Your navy is made of five hull types. Each formation sits in one sea region (its **station**) and holds one **posture** (a standing order) until you change it. The carrier is the only hull that can fly missions and the only one whose weapons reach inland. Destroyers and frigates screen the fleet and shoot down aircraft. Submarines hide and squeeze sea lanes. Amphibious groups carry marines. Costs and upkeep are on [Units, Recruitment & Procurement](/wiki/military-units); this page covers what each hull does once it is at sea.

## How it works

You buy hulls as ordinary units (see [Units, Recruitment & Procurement](/wiki/military-units)). Each formation then sits in one sea region and follows one posture. Every turn, the postures of all fleets in a region decide who wins sea control, how much trade a blockade closes and who gets hurt in a surface action. Fleets need port berths and supply, and they wear down.

### Key numbers

| What | Value |
| --- | --- |
| Hull types | 5 |
| Berth cost | Carrier 3, Amphibious Group 2, everything else 1 |
| Berths available | Home 100%, ally 75%, neutral 40%, hostile coast 20% |
| Carrier build time | 10 turns (6 for other hulls) |
| Posture readiness cost per turn | Blockade 14, Sea Control 12, Sea Denial 10, Transit 10, Escort 8, Port recovers 30 |
| Readiness regained per turn | 6, on top of the posture's cost |
| Sea control | 0 to 100 per region; rises 12 a turn, falls 15 |
| Landing marines needs | Sea control of at least 65 in the adjacent water |
| Detection levels | 0 to 3 |
| Repair per turn | 12 in port, 5 on station, scaled by supply |
| Free repair ceiling | 100 at home, 90 in an allied port, 80 elsewhere |
| Withdrawal thresholds | Condition under 35 or readiness under 25 |

### A worked example

A carrier group and two destroyers enter a region where an enemy squadron holds sea control of 70. Your ships are 80% of the weight in the region, so your sea control moves towards 80 at 12 a turn: 12, 24, 36, 48, 60, then 72 on turn 6. That passes the 65 needed to land marines, so your amphibious group can land on turn 6. The enemy's figure moves towards its 20% share and falls 15 a turn: 55, 40, 25, then 20.

Holding Sea Control costs each ship 12 readiness a turn and it regains 6, a net loss of 6. From 90 readiness the fleet drops below the withdrawal point of 25 after 11 turns, and then returns to port on default orders.

## The five hulls

| Hull | Personnel | Berth cost | Anti-air share | Flies missions | Role |
| --- | --- | --- | --- | --- | --- |
| Carrier Strike Group | 7,500 | 3 | Highest | Yes | The heaviest hull. Its number is its air wing: it defends itself from the air, and it is the only hull that projects power over a coast. Ten turns to build before it can fight. |
| Guided-Missile Destroyer | 330 | 1 | High | No | The dedicated anti-air escort. Second only to the carrier at shooting down strikes. |
| Attack Submarine | 130 | 1 | Almost none | No | Hard to find, weak in a stand-up fight, cheap to keep on a lane. Its default job is sea denial. |
| Frigate Squadron | 600 | 1 | Moderate | No | The light escort. Cheapest hull to buy and run. |
| Amphibious Group | 2,800 | 2 | Low | No | Carries marines. Landing them across water needs your side to hold at least 65 sea control in the adjacent water. |

Combat weight ranks carrier, submarine, amphibious group, destroyer, frigate, in that order. A formation is worth what the rest of the military system says it is worth, after readiness, equipment, veterancy, damage and supply.

**Berth cost** is the footprint a hull asks of the port it operates from. An ally's port gives you three quarters of its berths, a neutral's less than half, a hostile coast a fifth. Formations over capacity lose supply.

## Postures (standing orders)

A posture persists across turns. Each costs readiness every turn it is held, and readiness regenerates slowly, so a fleet cannot hold an aggressive posture forever.

| Posture | Readiness cost per turn | What it does |
| --- | --- | --- |
| Blockade | 14 | Full weight on closing the lane. Highest signature: you are sitting still where everyone can see you. |
| Sea Control | 12 | Fight for the water. Full weight in a surface action, some lane pressure. |
| Sea Denial | 10 | Submarine posture. Lowest signature, roughly two thirds of the hull's weight on the lane, weak in a stand-up fight. |
| Escort | 8 | Screen the group. Doubles this hull's anti-air contribution. Very little lane pressure. |
| Transit | 10 | Move. Fights badly while moving, closes nothing. |
| Return to Port | Recovers 30 | Rest, rearm and repair. Projects nothing. |

A carrier given an air mission (patrol, strike, close air support and so on) is flying, not sailing: it applies no lane pressure and fights at reduced weight while its wing is up.

### Default orders

Formations you have not ordered follow a fixed priority list: return to port if condition is below 35 percent or readiness below 25; return to port in peacetime; Sea Control if a hostile fleet shares the region; Sea Denial for submarines; Blockade if the station is on an enemy's trade approaches; otherwise Transit. It is a rule list, not an AI, so you can out-think it.

## Surface actions, sea control, detection

Wherever two hostile fleets share a region and at least one is on Blockade, Sea Control or Sea Denial, they fight that turn. The result is deterministic: the heavier side wins and the margin decides the damage. A wrecked formation is not deleted; it keeps its general and rebuilds through the normal reinforcement path.

Each country holds a **sea control** figure from 0 to 100 per region. It moves toward your share of the weight present, rising 12 points a turn and falling 15, so leaving a lane costs more than returning earns. Uncontested presence builds it on its own.

\`\`\`wiki-chart
sea-control-build-and-decay
\`\`\`

**Detection** runs from 0 to 3 per region. Anti-ship strikes need level 2 or better on the target, so a fleet can be known to exist and still not be attackable. It decays one band per turn once you leave.

## Repair and losses

Hulls mend between fights, never during one: 12 condition a turn in port, 5 on station, scaled by supply. Free repair caps at 100 in a home port, 90 in an allied port and 80 anywhere else. Once the fleet's average condition drops below 70, war approval takes a growing penalty. It is a cost only; holding the sea earns no approval bonus.

## Where to find it in game

The defence seat holder commands the whole force from **Naval and air command** under the country page, reached from the Commands tab of the defence cabinet office.

## What you can do

The defence seat holder commands the whole force from **Naval and air command** under the country page, reached from the Commands tab of the defence cabinet office. For each formation you pick a posture, and for a carrier an air mission. To set a fleet to blockade, put it on the Blockade posture in a region on the target's approaches.

Common questions: *Why will my amphibious group not land?* Your sea control in the adjacent water is under 65. *What does sea control do?* It decides who can land marines and shapes surface actions. *Why does my fleet keep returning to port?* It is in peacetime, or its condition is below 35 or its readiness below 25, and you gave it no order.

## Connections

**Driven by**

- [Units, Recruitment & Procurement](/wiki/military-units): the hulls are bought, equipped and kept up there.

**Affects**

- [Blockades](/wiki/blockades): fleets on Blockade or Sea Denial create the lane pressure that closes trade.
- [Fighting a Battle](/wiki/fighting-a-battle): a carrier on station and sea control cut or protect a land front's supply.

## Status

The naval layer works in every world and era in which a country has a navy. Which hulls exist depends on the year and the country's branches. Scotland and Wales have no defence seat and so no fleet orders.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact naval rules have no design page of their own yet. The unit catalogue and pricing are on [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html).

## Related pages

- [Blockades](/wiki/blockades): turning lane pressure into closed trade
- [Fighting a Battle](/wiki/fighting-a-battle): how sea and air support reach a land front
- [Commands & Command Structure](/wiki/military-commands): the command structure
`;
