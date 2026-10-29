export const marketSystemGuideContent = `# Market System: A Player's Guide

Your sector produced the same amount this turn and earned less. The reason is almost always the **market system**: the set of rules that decide how much money your corporations actually make from what they produce. It builds on the raw [Commodities](/wiki/commodities) market, and it's what ties your day-to-day pricing and investment decisions to your [share price](/wiki/stock-market). This page is the *why* and the *what do I do*; for the formulas and constants, the [Commodities reference](/wiki/commodities#market-tiers-clearing-and-capital) has them.

## From a revenue number to earned revenue

Older versions of the game paid your corporation a revenue number based mostly on market share and margins. The market system makes that revenue **earned**: prices react to scarcity, your goods have to find real buyers, and the capacity you build is a durable asset that shows up in your valuation.

It is organized in **tiers**. Current worlds run at **plants**, with the entire ladder active; older worlds may sit on an earlier tier, and a step back by [Market Safeguards](/wiki/market-safeguards) moves the world to an earlier market model. Each tier adds one more layer of realism and usually one more panel on your sector's detail page.

| Tier | What it does | What you see |
| --- | --- | --- |
| **Off** | Legacy behaviour: revenue from share and margins. | Nothing new. |
| **Realization** | Scarce goods pay a top-line premium; gluts bleed revenue. | Higher/lower sector revenue as prices move. |
| **Ledger** | Book-keeping groundwork for the tiers below (no new player action). | Mostly behind the scenes. |
| **Clearing** | Your output must actually sell: cheapest sellers clear first. | A **&ldquo;% sold last turn&rdquo;** badge and **pricing posture** controls. |
| **Capital** | Your growth budget builds owned **capacity**; output is gated by it. | A **Capital panel** with a per-unit economics breakdown. |
| **Plants** | Your sectors **are** their plants. Revenue is derived from what those plants make and sell, and the nameplate stops growing on its own. | Build orders and a capacity figure that only moves when you build. |

You do not choose the tier. Your job is to understand each layer so you can price and invest well under the tier your world runs.

## When scarcity pays

Every commodity has a price that moves each turn based on how much of it corporations produce (supply) versus how much they consume (demand). Scarcity pushes prices up; a glut pushes them down. The full mechanic (the 27 commodities, the curves, the three-tier blend) lives in Commodities. Copper is merged into rare earth; it is not a separate commodity. The market system is what turns those prices into your revenue.

The first economic tier is **price realization**. Instead of only nudging your margin percentage, commodity prices now **scale your top-line revenue**:

\`\`\`
factor = clamp((price / basePrice) ^ 0.5, 0.7, 2.0)
realizedRevenue = baseRevenue × factor
\`\`\`

| Market condition | Realization factor |
| --- | --- |
| Balanced (price = base) | 1.0× |
| Mild shortage (2× price) | ~1.41× |
| Big shortage (4× price or more) | up to 2.0× (capped) |
| Oversupply (0.5× price) | ~0.71× |
| Deep glut | down to 0.7× (floored) |

It's **bounded and damped** on purpose: realization alone moves your revenue at most **-30% / +100%** in a turn, and it uses last turn's prices so it can't oscillate wildly. The takeaway: **producing something scarce is now genuinely rewarding**, and dumping into a glut genuinely hurts. See [Price Realization](/wiki/commodities#price-realization) for the details, and chase scarce commodities: watch Commodities prices and shift toward tight markets.

## Setting your pricing posture

Once **clearing** is on, revenue is no longer handed to you: your output competes for real buyers. Each turn, demand fills the **cheapest sellers first**. Your realized revenue scales with the fraction of your output that actually sold (your **&ldquo;% sold last turn&rdquo;**). Check it each turn and adjust: unsold stock is lost revenue.

This makes your **pricing posture** a real decision. Posture steps from -20% to +20% around the market reference (-20, -10, -5, 0, +5, +10, +20), or Auto. You set it per sector in the CEO operations table. In plain terms:

| Posture | What it does | Good when |
| --- | --- | --- |
| **Undercut** (negative steps) | Price below the market to clear ahead of rivals. | You want to sell out; there's a glut. |
| **At-market** (0) | Price at the going rate. | You're unsure; balanced conditions. |
| **Premium** (positive steps) | Skim for margin, accept the risk of unsold stock. | Genuine shortage: everyone sells out anyway. |

In a shortage, everyone sells out and premium pricing pays. In a glut, the undercutters clear and the skimmers are left holding unsold output, which drags down their revenue, valuation, and share price. Want volume and market share? Undercut. Want margin in a genuine shortage? Go premium.

\`\`\`clearing-posture
\`\`\`

There's also a physical limit: **input throughput can gate output**. If you can't get enough of the inputs your sector consumes, you physically can't produce (and therefore can't sell) at full tilt, no matter how you price.

![The pricing posture control and the % sold badge](/images/wiki/market/pricing-panel.png)

*(screenshot from the live Pricing panel)*

![The Commodities / throughput panel showing input availability gating output](/images/wiki/market/throughput-panel.png)

*(screenshot from the live Commodities / throughput panel)*

### Who gets served first

Demand is filled in this order each turn: **contracted** volume from [Supply Agreements](/wiki/supply-agreements) first, then the **loyal slice**, a 40% share of each market reserved for sellers with strong [Brand Loyalty](/wiki/brand-loyalty), then **cheapest-first** for the rest. A steady, reliable seller keeps part of its sales even when a rival undercuts, and your posture and fill rate are the loyalty inputs.

## Capacity you own and maintain

Under the **capital** tier, your **growth budget becomes investment**. That investment builds productive **capacity**: a durable asset your company owns. The loop:

\`\`\`capital-loop
\`\`\`

Three things to internalise:

- **Capacity gates output.** You can only produce (and sell) up to what your capacity supports. Want more output? Invest to build more capacity.
- **Depreciation erodes idle capacity.** Capacity depreciates slowly every turn. A sector that stops investing gradually loses capacity, so reinvestment isn't optional if you want to hold your position. Keep the growth budget high enough to at least offset depreciation, more if you want to grow output.
- **Unit economics are visible.** The sector page shows a full per-unit breakdown, **price - labour - inputs - capital charge = unit profit**, so you can see the true economics of each unit, including the cost of the capacity it was built on.

![The Capital panel showing capacity, depreciation, and the per-unit price minus labour minus inputs minus capital-charge breakdown](/images/wiki/market/capital-panel.png)

*(screenshot from the live Capital panel)*

## Your sectors are their plants

The **plants** tier is the end of the road, and it closes the last gap between what you own and what you earn. Under capital, capacity gated your output but a sector still carried a nameplate revenue number that grew on its own. Under plants that number is **derived**: it is the capacity you own, priced at what your output mix sells for. Nothing else feeds it. What your plants earn follows the clearing and realization rules above; see [Running a Corporation under the Plants System](/wiki/plants-corp-guide).

Three consequences follow, and they change how you play:

- **Output grows only when capacity does.** There is no passive revenue drift to lean on. If you want a bigger sector next year, you have to commission plant this year and wait for it to arrive. A sector you stop funding is a sector you are slowly closing.
- **Entering a market is a build.** Founding a sector charges an era-scaled entry fee *and* a starter build of one facility, and that facility sits in a build queue before it produces anything. A brand-new sector earns nothing on its first turn.
- **Taking share moves plant.** Splits and attacks no longer shuffle a revenue number around: they transfer real capacity units. Both are priced with a floor at build cost plus a premium, so capturing capacity is never cheaper than building it, and an attack **destroys** part of what it takes. See [Corporations](/wiki/corporations) for the capture and attack formulas.

The practical upshot: growth is slower, more deliberate and more defensible than it was under the older tiers. A rival cannot conjure a sector overnight, and neither can you. Capacity arrives on a delay, so the plant you order now is the output you get later; decide where you want to be several turns out rather than reacting to this turn's prices. Unlocks in [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d) shift your cost and output curves.

## What this does to your valuation

Because capacity is a **real, owned asset**, your company is valued for the durable capacity it owns, not just this turn's earnings. Valuation leans on **tangible book** (your liquid capital + sector value + an owned-capacity floor) weighted *above* raw earnings power.

That capacity floor is a **depreciated high-water mark** on the sector's going-concern value: it's seeded at the moment a tier flips (so it changes nothing at first) and only decays slowly if the sector is genuinely impaired. The practical effect: **a company holds its value through a transient profit dip**, because the assets it owns are still worth something even in a bad quarter. Your share price reflects **owned assets + earnings power**, not a single turn's profit, so think in assets, not just this turn: a dip in profit isn't a collapse if you own real capacity, and rivals who stop investing are quietly getting weaker. More on how shares are priced in [Stock Market](/wiki/stock-market).

## When a new tier goes live

When a new tier is switched on, **nothing changes on the first turn**. The flip turn itself is a no-op. From there the new mechanics **fade in gradually over roughly 240 turns**, so valuations *drift* rather than *lurch*.

This is deliberate. You get time to adapt your pricing posture and investment level as the new rules take hold. There's no overnight shock to your corporation or the market. If you see a tier go live, you don't need to do anything immediately; just start reading the new panels (the Pricing panel, the throughput/Commodities panel, and the Capital panel each tell you why your revenue is what it is) and adjusting over the coming turns.

Applies in current worlds, which run the full plants tier; older worlds may run an earlier one. Last checked 2026-10-29, version 1.18.0. This page has no separate design page; the market-tiers reference is in [Commodities](/wiki/commodities#market-tiers-clearing-and-capital).
`;
