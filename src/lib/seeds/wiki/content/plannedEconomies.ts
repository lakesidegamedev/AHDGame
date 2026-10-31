export const plannedEconomiesContent = `# Planned / Command Economies

Your state firm is insolvent and nobody is closing it. The ruble has not moved in a hundred turns. Prices ignore supply and demand. None of that is a bug: you are in a **planned (command) economy**, a different model from the market countries, and a played one. In a command country you run the state industries, allocate the national plan, and direct state credit. Whether the country stays communist or reforms toward the market is decided by how well the plan is run, not by a script. See [Commodities](/wiki/commodities) and [Currency Exchange](/wiki/currency-exchange) for the market path; this page is the planned path.

## When a country is planned

Command economies exist in 1953, 1979 and 1991 starts and not in worlds that start in 1999 or later. Countries that start on the command end of the dial (USSR/Russia, China in its early eras, Eastern-bloc satellites) come up as planned economies, with their state industries split into separate enterprises you can run. Two gates must both be true:

1. The world starts in an era with command regimes (1953, 1979 and 1991 starts; a 1991 world opens with the USSR fully command and China dual-track).
2. The country's **marketization level** is below the market ceiling. The era only sets the *starting* value. From there the level moves on its own each turn based on what happens in the economy (see The marketization dial is earned below).

A **marketization dial** from 0 to 100 measures how far a country has moved toward the market.

| Band | Dial | What you get |
| --- | --- | --- |
| Fully command | below 30 | Fixed currency, passive bank, administered CPI, soft budgets, full planned pricing |
| Dual-track | 30 to under 70 | Plan and market run together; national prices and shortage pressure scale with how much is still planned |
| Market | 70+ | Standard floating FX, chair policy, supply-and-demand commodity pricing |

\`\`\`wiki-chart
marketization-schedule-by-country
\`\`\`

Soviet Russia and early China start fully command; Eastern-bloc countries start command; China starts further along the dial in later eras. Where each ends up is now up to how the country is governed.

| Rule | Value |
| --- | --- |
| Fully command band | Marketization below 30 |
| Dual-track band | 30 to under 70 |
| Market band | 70 and above (100 is fully market) |
| Wage fund brake | Planned share pulls nominal wage growth toward real-goods growth plus 2 points; it never raises wage growth |
| Era gravity | A weak pull toward the historical schedule, capped below what the free drivers can sustain |
| Private corporations | Cannot be founded in a fully command country |

Private [corporations](/wiki/corporations) cannot be founded in a fully command country.

## The enterprises

Instead of one national conglomerate, a command country's economy is split into **separate state enterprises (SOEs), one per sector**. The USSR and its republics, the Eastern bloc and Yugoslavia get one for every operating sector; China gets six (manufacturing, energy, extraction, agriculture, retail and chemicals). Each SOE carries its own:

- **Plan target**: the output quota it is expected to hit.
- **Output**: what it actually produced this turn.
- **Plan fulfillment**: output divided by target. This is the score the enterprise is judged on.
- **Capacity**: how much the enterprise *could* produce if it ran flat out.
- **Efficiency**: a slow moving average of **capacity utilisation** (output divided by capacity). Each turn it moves a tenth of the way toward this turn's utilisation, nudged by the director's labour/quality slider. It is *not* cost per unit. Efficiency under 50% means the enterprise has been using about half the capacity it owns; over 100% means it has been running above nameplate. Idle capacity still costs upkeep every turn, so low efficiency is a bill, not just a low score.
- **Cumulative losses**: the running tally of missed plan (the soft-budget bill).

When lots of SOEs beat their targets, the plan is working and the command model holds. When they chronically miss, shortages build and pressure to reform the whole system grows.

A heavy-industry SOE has a plan target of 1,000 units and a capacity of 1,200 units, and produces 900. **Plan fulfillment** is 900 / 1,000 = **90%**. Capacity utilisation is 900 / 1,200 = **75%**, and the efficiency figure trends toward it over the next turns. The missing 100 units of plan adds to its cumulative losses, and idle capacity still costs upkeep.

If the Gosbank Chair funds it, new capacity of 300 units would drop utilisation to 900 / 1,500 = 60%, and efficiency would trend down toward it until output catches up. If it chronically misses plan, shortages grow, the black market swells, and marketization drifts upward toward the dual-track band at 30.

## Who sits where

A command economy is run through three offices. Each is filled by the government (cabinet or Supreme Soviet). If a seat is empty, the state brain runs it competently by default, so single-player worlds still work. A human who claims a seat takes over from the brain.

### SOE Director (the industrialist)

One director seat per strategic SOE. The director runs a single enterprise and chooses:

- **Production target**: play it safe or stretch for a higher quota.
- **Investment request**: ask the Gosbank Chair for capital to expand.
- **Labor vs quality**: one slider, not two levers. Push it toward **quality** and the efficiency trend slowly climbs; push it toward **raw output** and the efficiency trend slowly drags down. It is a small nudge each turn (efficiency is mostly set by how well capacity is used), so treat it as a long-run lean: quality on the enterprises you are building up, raw output to squeeze the ones already running flat out.

Miss your targets and you feed the shortages that erode the whole command system. The automatic credit allocation leans toward enterprises that miss plan, so hitting it is about holding the system together, not winning more money.

Because efficiency is capacity utilisation, investment (new capacity from the Gosbank) does the opposite of what it looks like on a *low*-efficiency enterprise: adding capacity to a factory that is only half used pushes utilisation down further and adds more upkeep for capacity nobody is producing with. The rule of thumb:

- **Invest where efficiency is high** (near or above 100%). These enterprises are capacity-constrained with real demand behind them, so more capacity turns into more output.
- **Where efficiency is low** (well under 50%), do **not** pour in capacity. Lean the labor/quality slider toward raw output to use the capacity already there, and drop the investment request so the Gosbank stops building more. Directors have no lever to close capacity, so an enterprise sized far above its demand stays a loss machine until output catches up.

### Gosplan Central Planner (the macro)

The planner (or the head of government) sets the **national plan**: the output quota for every enterprise. The investment split across sectors belongs to the Gosbank Chair. This is the heavy-industry-versus-consumer-goods balancing act. Over-ambitious targets look strong on paper but widen the gap between plan and reality, which shows up as shortage. Under-ambitious targets leave growth on the table.

### Gosbank Chair (the kingmaker)

The Gosbank Chair runs **state credit**. Each turn the bank lends a credit budget across the SOEs, and the chair decides:

- **Which sectors get the money**: pick winners with an explicit per-sector allocation, or let the bank steer credit toward the enterprises that are missing plan.
- **How aggressively to fund**: a restrained credit posture or a flood.
- **Budget softness**: bail out insolvent SOEs and keep them running (soft), or let the weak ones fold to force efficiency (hard).

Directed credit is the chair's main lever, and it is a genuine tradeoff. **The upside**: credit builds an SOE's capacity and lifts its output over the following turns. Fund the right sectors and you hit the plan and hold the economy together. **The cost**: the part of that credit not backed by real household savings is **printed money**. It piles up as monetary overhang, which drives shortage. Fund everyone generously and you empty the shelves.

That is the Gosbank tightrope. You can grow industry with cheap credit, but the more you print the worse the shortages get, and shortages are one of the forces that push the country toward the market. You have to choose favorites. Fully command economies run a passive monobank: the automatic rate setter does not fire (see [Central Banks](/wiki/central-banks)), so do not expect rate hikes and cuts to chase inflation and growth.

## The marketization dial is earned

The single most important change: **marketization is no longer scripted.** The era sets the starting level, then it drifts every turn based on three live drivers. Shortage, overhang and the black market, which appear in the Planned Economy panel on the country's Budget and Economy pages, feed the first.

| Driver | Pushes toward market when... |
| --- | --- |
| Black-market pressure | Shortages, the shadow premium (the markup black-market goods sell at over the official price), and the second economy are large |
| SOE performance | The state enterprises are using little of their capacity (output well below capacity) |
| Policy stance | The elected government and the Gosbank lean reformist (market-leaning ruling party, disciplined credit, hard budgets) |

There **is a weak era gravity**: a small restoring pull toward the historical schedule for that turn, on top of the three free drivers above. It is deliberately capped below what the free drivers can sustain, so it nudges rather than dictates. History can still break: a well-run orthodox USSR can stay red long past 1991, and a badly mismanaged one reforms toward the market and, eventually, out of communism. A hardline government with a disciplined plan can hold command indefinitely against gravity; a reformist government that lets the enterprises fail will marketize faster than the schedule alone would predict.

**Government reformism is live.** The ruling party's economic position feeds the policy driver directly (see [Elections: A Granular Player Guide](/wiki/elections-player-guide)). Win an election with a market-leaning party, or shift the ruling party's economic stance through gameplay, and marketization responds. This works whether the government is player-led or run by the state brain. A reformist government marketizes, an orthodox one entrenches.

### Three loops

- **Reform spiral**: underfund the SOEs, they miss plan, shortages grow, the black market swells, marketization rises, market rules creep in, and eventually the command economy unwinds. A mismanaged state collapses early.
- **Stable orthodoxy**: fund the right sectors, hit the targets, keep the black market contained, and the dial holds. The country stays command for as long as you run it well.
- **Gosbank tightrope**: print to grow output, but watch overhang and shortage climb with it. Growth and empty shelves are two sides of the same lever.

![The reform spiral, the stable orthodoxy loop, and repression with its legitimacy cost.](/wiki-images/diagrams/planned-economies-feedback-loops.svg)

### Repression: holding the line

Reform is not the only answer to a swelling black market. A hardline government can crack down instead. The Gosbank Chair or head of government can set an **internal repression** level that discounts the black-market premium and grey market (by up to 80% at full repression) in the pressure that pushes toward reform, slowing the drift toward the market.

What repression does **not** do is fix the shortage. The shelves are still empty; you have only pushed the trading underground. And it is not free: cracking down costs regime legitimacy every turn, and the bill grows the harder you push amid scarcity. Heavy repression sitting on top of a deep shortage is a pressure cooker that bleeds legitimacy while the underlying problem festers.

That is the hardliner tradeoff. Repression buys time against reform and keeps the country command for longer, but it treats the symptom, not the disease. Deliver the goods and it stays cheap; repress amid empty shelves and it becomes expensive fast. Reform or repress, either way the shortage still has to be answered.

## How a command country differs

The planned machinery applies while a country sits in the command or dual-track bands.

- **Two-circuit wage fund**: planned share pulls nominal wage growth down toward real-goods growth plus 2 percentage points. It never raises wage growth. This is the primary brake on forced saving when wages outrun consumer goods.
- **Fixed official currency**: in a fully command country the official rate is pinned to its era anchor and does not float. Do not build forex strategies around it the way you would around USD, GBP, or JPY.
- **The iron curtain**: in the Cold War eras the bloc's trade with the open world is closed in both directions, while the bloc's internal market and the open world each trade freely among themselves. Yugoslavia, which broke with Moscow before the era begins, sits outside the curtain and trades with the West even though its domestic economy stays planned. See [International Trade](/wiki/trade-system).
- **Administered prices and CPI**: national prices are set by the plan, not cleared by supply and demand, and in a fully command country open inflation sits on the era path. Shortage shows up as unmet demand at a held price, not as a price spike.
- **Soft budgets**: in a fully command country state firms are not dissolved for insolvency the way market corporations are, unless the Gosbank Chair runs hard budgets. Zombie enterprises are the regime, not a stuck job.
- **Monetary overhang, shortage, black market**: when money outruns real goods, the excess becomes forced savings that feed a shortage index and a black-market premium. Read these instead of waiting for prices to clear.
- **The second economy**: repressed demand spills into an informal economy whose size tracks shortage and how far the state tolerates it. A tolerated grey market absorbs overhang and narrows the shadow premium.

Dual-track means plan and market run in parallel: a share of pricing and shortage machinery stays planned, the rest clears like a market. As the marketization level climbs through the 30-to-70 band, more of the economy behaves like a market and the planned machinery fades. Once the level passes 30, floating FX, an active central bank chair and normal insolvency rules return; when it passes 70 the rest of the planned machinery is gone and pricing is fully supply and demand.

## Playing a command country

Open a country's live control room at **Country > Command Economy**, for example the [Soviet command-economy dashboard](/country/ru/command-economy).

- Claim an SOE Director seat and drive one enterprise's targets, investment, and labor-versus-quality mix.
- As Gosplan Central Planner, set the national quotas and the investment split across sectors.
- As Gosbank Chair, direct credit to the sectors you want to grow and set how soft the budgets are, knowing the shortage cost of printing.
- As a hardliner, set internal repression to force the black market down and resist reform, weighing the legitimacy it costs against the shortage it leaves untouched.
- Read shortage, overhang, and the black-market premium as your early-warning signals, and remember marketization now moves with them.
- Change the country's direction through elections and party positioning.

You cannot rewrite the era starting level; only the *starting* value is era-authored, and everything after that is earned.

Applies only in worlds that start in an era with command regimes (1953, 1979 and 1991 starts) and only for countries on the command end of the dial, such as the USSR, early China and the Eastern bloc; modern-era worlds are fully market. A country leaves the command bands when its marketization level passes 70. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
