export const militaryUnitsContent = `# Units, Recruitment & Procurement

Your army is a list of **formations**. Each one is a real object with a headcount, a technology level, a veterancy grade, a posture, and (once you have generals) a commander. This page covers how you get them, what they cost, and how you improve them.

Everything here is done by the **defence seat holder** from their cabinet office → **Military** tab. An **acting** secretary seated without confirmation has the same departmental powers as a confirmed holder, including military operations, generals, doctrine, the nuclear programme and defence contracts. The acting appointment expires after 24 turns.

## How it works

Raising a unit takes four things, all at once: a ministerial action, enough manpower in the national pool, enough money in the defence appropriation, and a branch and unit type that exist in the current year. The unit then needs 6 turns to become operational, arrives in reserve, and costs upkeep every turn from the same appropriation until you disband it. The rest of this page covers each part.

### Key numbers

| What | Value |
| --- | --- |
| Ministerial actions held | Up to 4, regain 1 every 6 turns (4 a day) |
| Buy one extra action | 10 action points, once per turn, never above the cap of 4 |
| Cost to recruit or upgrade | 1 ministerial action each |
| Posture change, assign, disband | Free |
| Build time | 6 turns; Carrier Strike Group 10 turns |
| New unit starts at | Standard posture, veterancy Regular, 70% readiness, in reserve with no general |
| Upgrade price, by tier you step into | 25% (Standard), 35% (Modernized), 50% (Cutting-Edge) of the build price |
| Upkeep by posture | Garrison 0.85, Standard 1.0, Forward-Deployed 1.25, High Alert 1.5 |
| Upkeep by tech tier | Legacy 0.85, Standard 1.0, Modernized 1.2, Cutting-Edge 1.45 |
| Upkeep by national force tier | Reduced 0.85, Standard 1.0, Elevated 1.25 |
| Readiness a posture settles at | Garrison 60, Standard 72, Forward-Deployed 84, High Alert 92 |
| Readiness recovery | Up to 8 points per turn |

### A worked purchase

A country with a cost multiplier of 1.0 and a price-anchor GDP of 500,000 (in its own currency units) buys an Infantry Division. The price is 500,000 × (1,600 / 387,000) × 1.0 = 2,067. The division also draws 12,000 men from the manpower pool and uses 1 ministerial action. The order is refused if any one of the three is short. Six turns later it is operational. A country with a multiplier of 2.6 and a price-anchor GDP of 2,000,000 pays 2,000,000 × (1,600 / 387,000) × 2.6 = 21,499 for the same division.

## Domains and branches

Units belong to one of six **domains**, and every domain is fielded through a **branch**: your country's actual named service.

| Domain | What it fields |
| --- | --- |
| **Ground** | Armour, mechanised, infantry, artillery, special forces, air defence |
| **Naval** | Carriers, destroyers, submarines, frigates, amphibious groups |
| **Air** | Fighters, bombers, airlift, air defence, drones |
| **Marine** | Expeditionary units, marine divisions, littoral teams |
| **Rocket** | Ballistic and cruise missile formations, strategic deterrent |
| **Space** | Orbital surveillance, launch operations, space defence |

Branches are historically named and **era-gated**. Recruiting is not a flat catalogue: you get what your country actually had, in the year it actually had it.

Some consequences worth knowing before you plan a build:

- **West Germany has no armed forces in 1953.** The Bundeswehr's first volunteers are sworn in 1955. A 1953 world seeds DE with zero branches: this is correct, not a bug.
- **East Germany's NVA stands up in 1956.** DD also has no defence cabinet seat until then.
- **Japan in 1953** fields the National Safety Force and Coastal Safety Force. These *dissolve* in 1954 and become the JGSDF/JMSDF/JASDF.
- **The US Air Force** exists from 1947; the **Space Force** from 2019.
- **The PLA Rocket Force** dates from 1966 (as the Second Artillery Corps).
- **Soviet Strategic Rocket Forces** from 1959; Space Forces from 1992.

Unit *types* are gated the same way. **Drone Commands** require 1995. **Every space archetype** requires 2019. You cannot invent a Predator in a Cold War game.

## The unit catalogue

Costs below are **catalogue values**, not what you pay: see pricing below. \`Establishment\` is the unit's full-strength headcount, which is also the manpower it costs to raise.

### Ground

| Type | Establishment | Cost | Upkeep |
| --- | --- | --- | --- |
| Armored Division | 15,000 | 4,200 | 180 |
| Infantry Division | 12,000 | 1,600 | 70 |
| Mechanized Brigade | 4,500 | 2,100 | 95 |
| Artillery Regiment | 3,000 | 1,300 | 55 |
| Special Forces Group | 1,400 | 2,400 | 120 |
| Air Defense Battalion | 900 | 1,900 | 88 |

### Naval

| Type | Establishment | Cost | Upkeep |
| --- | --- | --- | --- |
| Carrier Strike Group | 7,500 | 13,800 | 620 |
| Amphibious Group | 2,800 | 4,100 | 190 |
| Attack Submarine | 130 | 3,400 | 150 |
| Guided-Missile Destroyer | 330 | 2,200 | 110 |
| Frigate Squadron | 600 | 1,700 | 80 |

### Air

| Type | Establishment | Cost | Upkeep | Era |
| --- | --- | --- | --- | --- |
| Fighter Wing | 1,800 | 5,600 | 250 | None |
| Bomber Squadron | 900 | 4,800 | 220 | None |
| Air Defense Wing | 1,100 | 2,600 | 115 | None |
| Airlift Wing | 1,500 | 2,300 | 100 | None |
| Drone Command | 600 | 1,900 | 70 | 1995+ |

### Marine

| Type | Establishment | Cost | Upkeep |
| --- | --- | --- | --- |
| Marine Division | 18,000 | 4,600 | 210 |
| Marine Expeditionary Unit | 2,200 | 3,200 | 150 |
| Littoral Combat Team | 1,100 | 1,800 | 85 |

### Rocket

| Type | Establishment | Cost | Upkeep |
| --- | --- | --- | --- |
| Strategic Deterrent Force | 2,000 | 9,800 | 410 |
| Ballistic Missile Brigade | 1,200 | 6,200 | 240 |
| Cruise Missile Regiment | 800 | 3,100 | 130 |

### Space (2019+)

| Type | Establishment | Cost | Upkeep |
| --- | --- | --- | --- |
| Space Defense Squadron | 900 | 4,400 | 190 |
| Orbital Surveillance Delta | 700 | 3,800 | 160 |
| Launch Operations Delta | 500 | 2,900 | 120 |

Read those tables in pairs. A **Special Forces Group** is a formidable unit for 1,400 people; an **Infantry Division** is a modest one for 12,000. If manpower is your binding constraint, the small elite formations are efficient. If money is, infantry is by far the cheapest power you can buy.

## What a unit actually costs you

A unit costs four separate things, and you must have all of them.

\`\`\`wiki-chart
infantry-division-price-by-country
\`\`\`

### 1. A ministerial action

Recruiting costs one ministerial action. Your cabinet seat holds up to 4 and regains 1 every 6 turns. Once per turn you can also spend 10 action points to buy 1 extra action, up to the cap.

\`\`\`wiki-chart
ministerial-action-bank
\`\`\`

That is the real throttle on how fast an army grows. You can raise at most four formations a day, however large your treasury or manpower pool. Upgrading also costs one, so recruiting and modernising compete for the same pool. Setting a posture, assigning a unit to a general and disbanding are free.

### 2. Manpower

A new unit is raised at full establishment, so it draws its full headcount from the national manpower pool. An Armored Division costs 15,000 men. If the pool is short, the order is refused with the exact numbers shown: "Insufficient manpower, 15,000 required, 9,400 available". There is no borrowing men. See [Manpower & Conscription](/wiki/manpower-conscription).

### 3. Money from the defence appropriation

The catalogue cost in the tables is not a currency amount. A unit is priced as a share of your country's own GDP, then multiplied by a per-country cost multiplier. An Infantry Division is about 0.41% of GDP before the multiplier, in every era and country.

Half of any GDP growth since the game began feeds into prices, so a growing economy slowly outruns its unit prices rather than cancelling against them.

The price is paid from the **defence appropriation**, the pot fed by your enacted defence budget line. It is a hard limit. If the unit costs more than the appropriation holds, the order is refused: "Defence appropriation is short, 2,067 required, 1,500 available". New orders cannot be put on credit. Money already promised to a supplier under a defence contract is not available either.

The cost multiplier:

| Multiplier | Countries |
| --- | --- |
| **2.6** | US |
| **2.4** | RU |
| **2.0** | CN |
| **1.7** | UK |
| **1.5** | FR |
| **1.4** | JP |
| **1.2** | IT, DD |
| **1.1** | SE, UKR |
| **1.0** | DE, IE, BR, PL, BLR, CS, BAL, ES, TR, SCO, WAL |
| **0.95** | YU |
| **0.9** | HU, RO, GR, FI |
| **0.85** | NG, BG, AT |

It is a cost multiplier, not a size multiplier. It makes American divisions more expensive to buy and keep, not bigger. Army size comes from what you build. Priced as a share of GDP, a unit costs a comparable slice of national output in every country, including Eastern Bloc economies that have no exchange rate.

### 4. Materiel from the national arsenal

Each unit also needs a load of equipment, counted in **lots**. A unit needs its cost divided by 387, rounded: 4 lots for an Infantry Division, 11 for an Armored Division. Recruiting draws those lots from your national arsenal at once. A short store does not block the order. The unit is raised anyway and arrives under-equipped, and the arsenal tops it up as deliveries land. The arsenal is stocked by [defence contracts](/wiki/defence-procurement). A unit's starting tech tier also comes from the grade of the materiel it received, so it is not always Standard.

The Soviet Union and East Germany have no contract market. Their state arms industry delivers a fixed 3 and 1 lots a turn respectively, straight to the store, pointed at whichever branch is furthest from a full load. That keeps an army equipped but will not keep pace with a war fought flat out.

## Building takes time

A new unit is not available at once. Most take 6 turns to become operational, and Carrier Strike Groups take 10. Until then it is on your roster but excluded from battle: it does not fight and does not appear in forecasts. Six turns is six real hours. Plan your build-up before the war, not during it.

## The four postures

Posture is a standing order for how hard a unit is worked. It is free to change and takes effect at once.

| Posture | Upkeep | Effect |
| --- | --- | --- |
| **Garrison** | 0.85 | Cheapest to maintain, weakest in the field. Home-defence footing. |
| **Standard** | 1.0 | The baseline. |
| **Forward-Deployed** | 1.25 | Noticeably more capable, noticeably more expensive. |
| **High Alert** | 1.5 | The most capable and by far the most expensive. |

Two rules:

1. A unit at a conflict cannot be on Garrison. It floors up to Standard automatically.
2. Posture only forces up. A unit returning to reserve keeps its posture and does not drop back to Garrison.

A force sitting heavily on Forward-Deployed or High Alert also tilts public trust and social cohesion at home. A permanent war footing has a political price. The **national force tier** (reduced, standard, elevated), set on the defence office Overview, scales readiness and upkeep across the whole army at once.

## Technology tiers

Every unit sits at one of four tech tiers: **Legacy, Standard, Modernized, Cutting-Edge**. Upgrading raises the tier by one step.

\`\`\`wiki-chart
military-tech-tier-power-vs-upkeep
\`\`\`

- **You pay up front.** The price is a share of the unit's build price, by the tier you step into: 25% to reach Standard, 35% to reach Modernized, 50% to reach Cutting-Edge. All three steps together come to 1.1 times a fresh build, so modernising from the bottom costs more than replacing the unit. Each step also costs one ministerial action.
- **You pay for it every turn.** Upkeep goes from 0.85 at Legacy to 1.45 at Cutting-Edge, a rise of 71%, while the power gain is far smaller.

That second point is the design. A Cutting-Edge division is better than a Legacy one and worse value than two Legacy ones. Cheap old kit is a legitimate strategy for a nation that needs mass.

Upkeep is derived on read, so a modernisation pass raises your whole running cost at once, including on units you upgraded long ago. Check your appropriation before a mass refit.

## Veterancy and strength

Veterancy has five grades: **Green, Regular, Seasoned, Veteran, Elite**. Grades are earned through fighting. Veterans are meaningfully better than green troops at the same headcount, so preserving an experienced formation is one of the most valuable things you can do. Rebuilding a veteran formation with conscripts dilutes it; see [Manpower & Conscription](/wiki/manpower-conscription).

Strength is current personnel divided by establishment, shown on the unit card. A unit ground down in battle fights at reduced effect in proportion to its losses. A division at 40% strength fights like a much smaller formation.

There is no destroyed state and no automatic disbanding. A mauled formation stays on the roster, keeps its general and position, and rebuilds in place through reinforcement.

## Upkeep and the defence appropriation

Every unit costs upkeep every turn, set by its base upkeep, posture, tech tier, your national force tier and your country's cost multiplier. It is paid from the same defence appropriation that buys units.

Each turn the appropriation receives one forty-eighth of your annual defence line. A country at its historical starting force spends 55% of that on upkeep. Double the roster and upkeep is 110%, which drains the pot. The appropriation may then go negative by up to one full year of the line. Beyond that, unpaid upkeep becomes arrears. Arrears do not delete units. They pull each posture's readiness target down, by up to 35% if nothing is paid, and the readiness recovers when funding returns.

So the more you raise, the less is left to buy with. Upkeep is also compared with your country's own starting force to set the budget-balance effect: a force below its historical size helps the budget score, and a large one hurts it.

## Disbanding

Disbanding is free and instant. The unit's surviving personnel return to the national manpower pool. There is no refund of the purchase price, which keeps unit churn expensive.

## Defence procurement contracts

Equipment is bought separately from units. The defence seat publishes tenders, corporations bid with their defence plants, and winning orders deliver lots of materiel to the arsenal over time. Publishing a tender reserves its maximum value against the appropriation. The full rules, including supplier limits and termination costs, are on [Defence Procurement](/wiki/defence-procurement).

## A sensible build order

1. **Check your era.** Open the recruit panel and see which branches and types exist this year.
2. **Check manpower and the appropriation before anything else.** Both refuse you outright.
3. **Build infantry for mass, specialists for edge.** Cheap divisions hold ground; special forces and armour break it.
4. **Build early and steadily.** One action every six turns plus six turns of build time means a serious army takes real weeks.
5. **Modernise selectively.** Upgrade the formations you intend to keep and fight with.
6. **Leave postures low in peacetime.** High Alert on a peacetime army burns money and erodes cohesion for nothing.

## What you can do

All of it is in the defence office, **Military** tab, held by the defence seat holder (or an acting holder):

- Recruit units (1 action, manpower, appropriation money).
- Upgrade a unit's tech tier (1 action, 25% to 50% of its build price).
- Set a unit's posture, or the national force tier (free).
- Assign a unit, or a whole branch at once, to a general (free).
- Disband a unit (free, personnel return to the pool).

**Common questions.** *Why does it say not enough manpower?* The pool holds fewer men than the unit's establishment. *How many units can I buy per day?* Four, from the action pool, unless you also buy extra actions at 10 action points each, once per turn. *Why does my unit show General Staff and not fight?* A new unit has no general and sits in reserve. Assign it to a general, and post that general to a conflict. *Is upgrading worth it?* Only for formations you will keep; see the upkeep curve above. *What does posture do?* It trades upkeep for field power and sets the readiness the unit settles at.

## Connections

**Driven by**

- [Manpower & Conscription](/wiki/manpower-conscription): the pool is the hard limit on how many men a new unit can draw.
- [Defence Procurement](/wiki/defence-procurement): contracts stock the arsenal that equips new units.
- [National Doctrine](/wiki/national-doctrine): doctrine nodes adjust upkeep and readiness of your forces.
- [Generals & the Officer Corps](/wiki/generals): units are assigned to a general and follow them.
- [Fighting a Battle](/wiki/fighting-a-battle): battles lower strength, readiness and veterancy.

**Affects**

- [Conflicts & the Military System](/wiki/conflicts-overview): the units you own are what a war has to fight with.
- [Commands & Command Structure](/wiki/military-commands): the force load a command carries sets its capacity penalties.
- [Fighting a Battle](/wiki/fighting-a-battle): strength, veterancy, tech and posture all feed the battle.
- [Declaring War](/wiki/declaring-war): your uncommitted reserve supplies the opening forces of a new war.
- [Naval Vessel Classes & Standing Orders](/wiki/naval-vessel-classes): the naval hulls are bought here and then ordered at sea.
- [Defence Procurement](/wiki/defence-procurement): unit purchase and upkeep draw on the same appropriation that contracts reserve.

## Status

Recruiting and upgrading work in every world and era, but the catalogue narrows by year: Drone Commands need 1995 or later, space units need 2019 or later, and each branch exists only in the years it did. The Soviet Union and East Germany draw state arsenal output instead of contract output.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact constants, pricing and budget rules are on the design page [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html).

## Next

- [Manpower & Conscription](/wiki/manpower-conscription): where the men come from.
- [Generals & the Officer Corps](/wiki/generals): how to get a commander for these units.
- [Fighting a Battle](/wiki/fighting-a-battle): how to actually use them.
`;
