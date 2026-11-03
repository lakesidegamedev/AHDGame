export const nuclearProgrammeContent = `# The Nuclear Programme

The bomb is the defence seat's biggest project: a small technology tree that turns defence appropriations into a warhead stockpile and, eventually, into a deterrent the whole world has to reckon with. This page covers how you get in, how you climb, what it costs, and what it does to the world when you do.

## Tests, legs and warheads

The defence seat holder adopts device nodes (the physics) by conducting public nuclear tests, adopts delivery nodes (the missiles and bombers) quietly, and sets a production rate for warheads. Warheads are paid for from the defence appropriation each turn. Tests raise the world's [Cold War Tension](/wiki/cold-war-tension), and the stockpile raises the floor tension settles at. A stockpile with delivery legs gives you a deterrence score, which is how credible your threat is.

### The numbers

| What | Value |
| --- | --- |
| Countries that can open a programme | United States, Soviet Union (Russia) and United Kingdom |
| Doctrine gate | National Doctrine node Nuclear Delivery (4 points, plus its 2 point predecessor) |
| Device tiers | Fission, Boosted Fission, Thermonuclear, MIRV |
| Production cap by tier | 2, 4, 6 and 8 warheads a turn |
| Cost per warhead by tier | 800, 650, 500 and 350 |
| Tension spike per test | 9, 6, 12 and 10 |
| Delivery legs | Bombers, IRBM, ICBM, SLBM |
| Deterrence score | 0 to 100, from warheads and number of legs |

## Who can open a programme

Two gates stand between a country and its first device. Both must be open.

1. **The capable set.** The named capable set is the **United States, the Soviet Union and the United Kingdom**. A country that already holds an adopted node in its programme also counts as capable, which is how a covert breakout country climbs the tree. Other countries do not have the industrial and scientific base, whatever their budget says. East Germany has a separate covert route, described below.
2. **The Nuclear Delivery doctrine node.** Your conventional [National Doctrine](/wiki/national-doctrine) tree must have adopted **Nuclear Delivery**, in Air Warfare, Strategic Bombing, a 1950s node costing 4 points. Its predecessor, Strategic Bombing Campaigns (1940s), costs 2, so the door costs 6 points of your doctrine budget in all.

Entry runs through the defence cabinet seat. If you do not hold the defence portfolio, you are lobbying whoever does. The programme belongs to the country, so it carries over when a new defence minister takes the seat.

## The device ladder

Device nodes are the physics. Each is adopted only by **conducting a nuclear test**, and a test is a world event: everyone sees it, tension rises, and your deterrence posture shocks upward. There is no such thing as quietly acquiring the hydrogen bomb.

![Dependency graph of the device tiers Fission, Boosted Fission, Thermonuclear and MIRV and the delivery legs Bombers, IRBM, ICBM and SLBM, behind the Nuclear Delivery doctrine.](/wiki-images/diagrams/nuclear-programme-dependencies.svg)

| Device | First available | Test cost | Production cap | Tension spike |
|---|---|---|---|---|
| Fission Device | 1945 | 12,000 | 2 warheads/turn | 9 |
| Boosted Fission | 1951 | 9,000 | 4 warheads/turn | 6 |
| Thermonuclear Device | 1952 | 18,000 | 6 warheads/turn | 12 |
| MIRV Warheads | 1968 | 22,000 | 8 warheads/turn | 10 |

Each tier requires the one before it. MIRV additionally requires an ICBM force. No node can be pursued before its year. The production cap is the ladder's real prize: your device tier is the ceiling on how many warheads the weapons complex can assemble per turn.

## Delivery legs

Delivery nodes adopt quietly, like ordinary doctrine: no test, no spectacle. They are what make the stockpile mean something.

| Delivery leg | First available | Cost | Requires |
|---|---|---|---|
| Strategic Bombers | 1945 | 6,000 | a fission device |
| IRBM Force | 1956 | 8,000 | bombers |
| ICBM Force | 1959 | 14,000 | IRBMs |
| SLBM Deterrent | 1960 | 16,000 | ICBMs |

A stockpile with no delivery leg deters nobody. Your deterrence score, from 0 to 100, rises with your warhead count and with how many legs you have, from about 55% of full weight with one leg to 100% with all four. One leg is a threat that can be disarmed on the ground. All four is a promise. The submarine leg is the classic second strike, the reason an enemy cannot win by shooting first.

## Building warheads

Once you have a device tier, you set a **production rate**: warheads ordered per turn, held to your tier's cap. Each warhead is paid for out of the defence appropriation at a unit cost that falls as your device tier matures: 800 at the fission tier, 650 at boosted, 500 at thermonuclear and 350 at MIRV. If the money is short, the complex builds what the budget allows and no more. There is no overdraft for new warheads.

\`\`\`wiki-chart
nuclear-warhead-production-by-tier
\`\`\`

The build draws on the part of the appropriation that is not already promised to a supplier under a [defence contract](/wiki/defence-procurement). A finance minister who starves defence, or a defence minister who commits the quarter to contracts, is also capping the arsenal. The same appropriation pays for unit purchases and upkeep; see [Units, Recruitment & Procurement](/wiki/military-units).

### A worked path in a 1953 world

A US defence minister spends 6 doctrine points on Strategic Bombing Campaigns and Nuclear Delivery. The Fission Device is available from 1945, so they test it for 12,000, then Boosted Fission (9,000, available from 1951) and Thermonuclear (18,000, available from 1952), 39,000 in all. Each test spikes tension, 9 then 6 then 12, a total of 27 points before decay. They add Strategic Bombers for 6,000. At the thermonuclear tier they order 6 warheads a turn at 500 each, which is 3,000 a turn out of the appropriation. After 10 turns the stockpile is 60 warheads and 30,000 has been spent. With only the bomber leg (the IRBM force is not available until 1956), the deterrence score is about 43. The same stockpile with all four legs would score about 77.

## What a test does to the world

A nuclear test is not a private milestone. When the device goes off:

- **[Cold War Tension](/wiki/cold-war-tension) spikes.** The jump depends on the device, and it is not monotonic: the boosted test spikes less than the fission test (see the table above). The whole world feels it, including your allies.
- **The news carries it.** The test appears in the world's recent developments. There is no concealing that it happened or who conducted it.
- **Your deterrence posture jumps.** Rivals' planners now price you differently.

Time your tests. A thermonuclear shot in the middle of an active crisis is pouring petrol on a fire you may not control.

### What a stockpile does in a war

Warheads are not a unit in a battle report. Their effect is on the world's temperature. The total warhead count across all programmes sets part of the floor tension relaxes towards, and a war between two nuclear-armed countries is treated as a crisis-grade shock from its first turn. Having a programme therefore changes how the world reacts to your wars, not how a battle resolves. A war between nuclear-armed countries raises tension at once; see [Conflicts & the Military System](/wiki/conflicts-overview). Warheads raise the shared tension floor and tests spike the reading, which is what feeds [Global Response Crises](/wiki/global-response-crises).

## Covert programmes

East Germany cannot join the public ladder, but it can build a bomb in secret. A covert programme is a grind through five stages, from uranium diversion to device assembly. Each stage takes 60 units of progress. You choose a funding level each turn from the defence appropriation:

| Funding | Progress a turn | Cost a turn | Turns for all five stages |
| --- | --- | --- | --- |
| Trickle | 1 | 90 | 300 |
| Steady | 2 | 260 | 150 |
| Crash | 4 | 780 | 75 |

\`\`\`wiki-chart
covert-nuclear-funding-levels
\`\`\`

Funding harder moves faster and burns brighter: it builds suspicion with the Soviets, and suspicion is what the discovery roll feeds on. A turn the budget cannot fund makes no progress and lets suspicion cool. Discovery is a Soviet crackdown, not game over: the programme loses its current stage and one completed stage, and the world learns something. The exact odds are not published. Finishing the last stage banks a device. The breakout test that announces it is a separate, deliberate and public act, and it is the biggest tension spike in the system.

## Who does what

- **Defence seat holder of a capable country:** adopt Nuclear Delivery in National Doctrine, then open the nuclear panel in the Military office, test devices, adopt delivery legs and set the production rate.
- **East Germany's defence seat holder:** set the covert funding level.
- **Everyone else:** watch the tension gauge and the news feed.

![Defence office Nuclear tab showing warheads in stockpile, deterrence credibility, the production rate control and the device ladder](/wiki-images/screens/nuclear-programme-nuclear-panel.webp)

Open to the United States, the Soviet Union and the United Kingdom in every world that runs the Cold War layer; the covert programme is East Germany only. Device and delivery nodes unlock by calendar year, so a 1953 world offers Fission, Boosted Fission and Thermonuclear but not MIRV or the ICBM and SLBM legs. Last checked 2026-10-29, version 1.18.0. Exact rules: [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html), which also holds the tension rules
`;
