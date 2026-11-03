export const crisisInteractionContent = `# Crisis Interaction

A wildfire is burning through a region, a bank has failed, a strike has stopped the ports. You can wait it out, or you can answer it. When a crisis comes with a decision card, the people in charge choose a response, sometimes put treasury money into a shared fund, and their choices change how long the crisis lasts and how hard it hits.

## Where the card comes from

A crisis starts from a game event, from economic or political conditions crossing a trigger, or from the automatic disaster schedule. It applies its effects to state metrics ([National Metrics](/wiki/national-metrics)), [government approval](/wiki/government-approval), corporate profit margins, and in some cases inflation, regional GDP and politicians' stats. Per-turn effects fade linearly from full strength at the start to zero at the end. Crises are created by the game itself, not by players. The wartime society events in [World Events](/wiki/world-events) open as crises with decision cards when world tension is high, and chained campaigns from [Global Response Crises](/wiki/global-response-crises) open their response windows through this same decision system. Crisis alerts and open decisions arrive in the [Notification Center](/wiki/notifications).

If the crisis has a decision tree, it appears as a card on your actions page and on **World Crises**. A tree is a short branching story: the first question is the active node, and each option leads to another node, a funding step or the end.

![Flow from a crisis starting to its decision cards, where an option leads to another node, a funding step with a treasury check, or the end, and an unanswered window resolves on its default.](/wiki-images/diagrams/crisis-interaction-decision-flow.svg)

## Who answers

Which card you see depends on your office: heads of government, cabinet members (some cards name a specific seat such as the finance minister), state governors, central bank chairs and party leaders can each get their own questions. If you cannot see a card, you do not hold the office it is addressed to, or the crisis has no decision tree. Single-country crises are answered by the first eligible leader. A crisis put to several countries at once, such as a Vietnam rung, is answered by each country's head of government separately, so one leader's answer never closes another's. Waiting on the other government does not help.

When the window closes, any unanswered question resolves on its default. Decisions already made stay made. For Vietnam the cautious default holds your current commitment. The turn clock in [Core Systems](/wiki/core-systems) decides cadence, expiry and when windows close.

## Paying into a collective fund

A funding step asks for money from your treasury. The game checks the balance in the [National Budget](/wiki/national-budget) first. If you are short, the option is blocked and shows how much is required against how much you have. A funding step is open to foreign contributors as well as local leaders.

| Item | Value |
| --- | --- |
| Funding step window (typical) | 24 hours of real time, which is 24 turns |
| Full funding of a collective fund | Cuts the crisis's total duration by 50% |
| Funding below target | Cut is proportional: 50% times the share of target raised, rounded down |
| Vietnam opening windows | 24 turns, 24 real hours |

Take a wildfire crisis with a regional governor decision, then a national suppression fund with a target of 10,000,000.

\`\`\`wiki-chart
collective-fund-duration-cut
\`\`\`

- The governor picks **Mandatory Evacuation**: the region's GDP growth takes a one-off 1 point hit. **Defend in Place** costs a 0.5 point growth hit and 3 points of government approval, but protects the economy more.
- Two leaders (heads of government, cabinet members or governors, from any country) contribute 5,000,000 and 2,000,000. The fund reaches 7,000,000, which is 70% of the target.
- The duration cut is 50% times 70% = 35% of the crisis's total duration. On a crisis lasting 20 turns that is 7 turns cut, rounded down.
- A third leader who declines gives nothing and loses nothing. The treasury is debited only for what a leader actually commits, and the amount is added to the fund total.

This is why funding is a real fiscal choice. Funding a fund that other governments will fill anyway is cheaper for you than carrying the whole bill.

## Disasters that arrive on a schedule

The automatic schedule creates regional disasters from the same templates, using each template's region-scale duration. It swaps in its own margin shock (below) unless the template already carries one. Players are hit as residents of the region: the penalty lands on sector margins, state metrics and approval, and disasters cut profit margins for sectors in the affected region ([Corporations](/wiki/corporations)). Automatic disasters apply effects only. They have no decision card.

| Item | Value |
| --- | --- |
| Auto-disaster cadence | One per country every 144 turns, staggered by country so they do not all fire together. Under high climate pressure a weather disaster can come early, but never sooner than 108 turns |
| Same disaster type recurring | At least 144 turns apart in a country |
| Auto-disaster margin penalty | Minus 10 percentage points on sectors in the hit region, fading linearly to zero by the end |
| Weather disaster treasury loss | 0.02% of smoothed GDP, scaled up where climate pressure is high and regional resilience is low |

Expect a disaster in roughly every 144-turn cycle, so keep enough treasury to afford a response; weather disasters also draw the treasury down directly.

## Chains

Some historical crises continue across several decisions instead of ending after one. A chain records its family and current stage, so later crises can advance, hold or reduce the same shared situation. Vietnam is the first full chain. The long-running international campaigns, including stages, country memory, tension and nuclear effects, are on [Global Response Crises](/wiki/global-response-crises).

- Pulling back from a chain lowers your committed support before it lowers the shared stage.
- Increasing support in a chain spends treasury and moves Cold War readiness, bloc cohesion, war weariness and procurement demand.
- A flashpoint crisis lets a nation's alignment move faster while it stays open; see [Bloc Alignment & Spheres](/wiki/bloc-spheres).

Applies in every current world. A world only sees the era-bound crisis types and chain families that fit its current year; natural disasters are not limited by era. Last checked 2026-10-29, version 1.18.0. Exact rules: [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html)
`;
