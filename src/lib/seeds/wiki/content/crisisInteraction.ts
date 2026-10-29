export const crisisInteractionContent = `# Crisis Interaction

A crisis is a shock to a country or region: a wildfire, a bank failure, a strike, a war emergency. Crisis Interaction is what lets you answer one instead of just waiting it out. When a crisis comes with a decision card, the people in charge choose a response, sometimes put treasury money into a shared fund, and their choices change how long the crisis lasts and how hard it hits.

## How it works

1. A crisis starts, either from a game event or from the automatic disaster schedule. It applies its effects to state metrics, government approval and corporate profit margins.
2. If the crisis has a decision tree, it appears as a card on your actions page and on **World Crises**. A tree is a short branching story: the first question is the active node, and each option leads to another node, a funding step or the end.
3. The person with the right office answers. Single-country crises are answered by the first eligible leader. A crisis put to several countries at once, such as a Vietnam rung, is answered by each country's head of government separately, so one leader's answer never closes another's.
4. A funding step asks for money from your treasury. The game checks the balance first. If you are short, the option is blocked and shows how much is required against how much you have.
5. When the window closes, any unanswered question resolves on its default. Decisions already made stay made.

### Key numbers

| Item | Value |
| --- | --- |
| Auto-disaster cadence | One per country every 144 turns, staggered by country so they do not all fire together |
| Same disaster type recurring | At least 144 turns apart in a country |
| Auto-disaster margin penalty | Minus 10 percentage points on sectors in the hit region, fading linearly to zero by the end |
| Weather disaster treasury loss | 0.02% of smoothed GDP, scaled up where climate pressure is high and regional resilience is low |
| Funding step window (typical) | 24 hours of real time, which is 24 turns |
| Full funding of a collective fund | Cuts the crisis duration by 50% |
| Funding below target | Cut is proportional: 50% times the share of target raised, rounded down |
| Vietnam opening windows | 24 turns, 24 real hours |

### Worked example

A wildfire crisis has a regional governor decision, then a national suppression fund with a target of 10,000,000.

\`\`\`wiki-chart
collective-fund-duration-cut
\`\`\`

- The governor picks **Mandatory Evacuation**: GDP falls 1.0% once. **Defend in Place** costs 0.5% GDP and 3 points of government approval, but protects the economy more.
- Two heads of government contribute 5,000,000 and 2,000,000. The fund reaches 7,000,000, which is 70% of the target.
- The duration cut is 50% times 70% = 35% of the remaining duration. On a crisis with 20 turns left that is 7 turns saved, rounded down.
- A third leader who declines gives nothing and loses nothing. The treasury is debited only for what a leader actually commits, and the amount is added to the fund total.

This is why funding is a real fiscal choice. Funding a fund that other governments will fill anyway is cheaper for you than carrying the whole bill.

### Automatic disasters

The automatic schedule creates regional disasters from the same templates, so the effects and durations match a crisis created by hand. Each country gets one every 144 turns at its own offset. Players are hit as residents of the region: the penalty lands on sector margins, state metrics and approval. A weather disaster also takes a small bite out of the national treasury. Automatic disasters apply effects only. They have no decision card.

### Chained crises

Some historical crises continue across several decisions instead of ending after one. A chain records its family and current stage, so later crises can advance, hold or reduce the same shared situation. Vietnam is the first full chain. The long-running international campaigns, including stages, country memory, tension and nuclear effects, are on [Global Response Crises](/wiki/global-response-crises).

## What you can do

- **Answer a card.** Cards appear on your actions page and on World Crises. Which card you see depends on your office: heads of government, cabinet members and state governors each get their own questions. If you cannot see a card, you do not hold the office it is addressed to, or the crisis has no decision tree.
- **Fund a collective response.** A funding step is open to foreign contributors as well as local leaders. Check your treasury before you commit.
- **Do nothing.** The default resolves for you when the window ends. For Vietnam the cautious option holds your current commitment.
- **Plan reserves.** An automatic disaster is guaranteed within each 144-turn cycle, so keep enough treasury to afford a response.

Tips:

- Pulling back from a chain lowers your committed support before it lowers the shared stage.
- Increasing support in a chain spends treasury and moves Cold War readiness, bloc cohesion, war weariness and procurement demand.
- Each opening Vietnam decision is separate for each superpower. Waiting on the other government does not help.

## Connections

**Driven by**

- [Global Response Crises](/wiki/global-response-crises): chained campaigns open response windows through this decision system.
- [National Budget](/wiki/national-budget): the treasury balance decides whether a funding option is available.
- [Core Systems](/wiki/core-systems): the turn clock decides cadence, expiry and when windows close.
- [World Events](/wiki/world-events): the wartime society events open as crises with decision cards when world tension is high.

**Affects**

- [Global Response Crises](/wiki/global-response-crises): supplies the card, role check and treasury debit used for campaign decisions.
- [Government Approval](/wiki/government-approval): crisis effects and chosen options move approval.
- [National Metrics](/wiki/national-metrics): crisis effects change state metrics such as GDP and unemployment.
- [Corporations](/wiki/corporations): disasters cut profit margins for sectors in the affected region.
- [National Budget](/wiki/national-budget): funding options and weather disasters draw down the treasury.
- [Notification Center](/wiki/notifications): crisis alerts and open decisions arrive as notifications.
- [Bloc Alignment & Spheres](/wiki/bloc-spheres): a flashpoint crisis lets a nation's alignment move faster while it stays open.

## Status

Live in every current world. Decision cards, collective funds and the automatic disaster schedule all run. A world set in an early era only sees disaster types and chain families that have started by its current year. Crises are created by the game itself, not by players.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules, effect structure and source files: [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html).
`;
