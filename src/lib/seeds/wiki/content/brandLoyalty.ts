export const brandLoyaltyContent = `# Brand Loyalty

A rival posts the same steel for 6 points less than you. Normally buyers fill orders **cheapest-first** (see [Market System: A Player's Guide](/wiki/market-system-guide)) and you lose the sale. **Brand loyalty** is what stops that being total: a reputation you earn by pricing steadily and actually selling what you offer, which keeps some customers buying from you at your posted price even when a cheaper seller exists.

## What loyalty protects

Every corporation has a hidden loyalty score from 0 to 100. You and your rivals see it only as one of five tiers.

| Tier | Loyalty score |
| --- | --- |
| Unknown | 0 to 19 |
| Emerging | 20 to 44 |
| Respected | 45 to 69 |
| Trusted | 70 to 89 |
| Iconic | 90 to 100 |

Each market reserves **40% of its demand** as "loyal-type" customers before the cheapest-first scramble. Sellers split that 40% in proportion to their loyalty, and each seller's slice is capped at the share of the market it would fill anyway. Sellers under 5 loyalty get no slice. The other 60% clears cheapest-first as normal. Contracted sales through [supply agreements](/wiki/supply-agreements) are filled before the loyal slice, and they count toward your fill rate.

The split is *relative*. If every seller has the same loyalty, everyone gets an equal share, which is the same as nobody having loyalty. You gain only by having more than your rivals. A strong brand is a shield, not a wall: undercutters still win the price-shopping 60% of every market.

![Demand clears first through supply agreements, then the loyal slice, then cheapest-first, with the three conditions for earning loyalty beside the loyal slice.](/wiki-images/diagrams/brand-loyalty-clearing-order.svg)

## Earning it, one point at a time

Each turn the game compares your price setting (your **pricing posture**, from -20% to +20% around the market reference) with your own recent norm. The norm is a slow average of your last ten or so turns, so it is *your* habit, not the market's.

**You gain 1 point per turn** when all three are true in the same turn:

- Your posture is within 4 points of your norm (steady pricing).
- You sold at least 50% of what you offered (you delivered).
- At least one rival in a shared [commodity](/wiki/commodities) posts a price 5 points or more cheaper than yours. Loyalty with no cheaper rival to resist proves nothing, so it does not build in a monopoly.

At that rate a new corporation needs about 20 steady, contested, delivering turns to leave Unknown, 45 to reach Respected, 70 for Trusted and 90 for Iconic. New corporations start at 0, and cannot earn a slice until they pass 5. A single gouge undoes ten of those turns.

\`\`\`wiki-chart
brand-loyalty-tiers-over-time
\`\`\`

## What takes it away

| Event | Loss |
| --- | --- |
| Gouging: posture jumps more than 8 points above your norm | 10 points, every turn the gap stays above 8 |
| Erratic pricing: posture more than 4 points off your norm | 1 point per turn (0.5 if you moved down, because a sale is not a betrayal) |
| Under-delivering: you sold less than 35% of your offer | 1 point per turn, on top of any pricing loss |
| Idle: nothing earned and nothing penalised | 0.25 points per turn |
| Losing a sector (sold, taken over, closed or nationalised) | Your loyalty drops by your loyalty times the share of revenue that sector made |

Loyalty is clamped to 0 to 100. The sector rule is the one that surprises people: a 60 loyalty [corporation](/wiki/corporations) that loses a sector making 30% of its revenue drops to 42.

## Two steel sellers

Corp A is steady at loyalty 60 (Respected). Corp B has been erratic and sits at 20 (Emerging). Total loyalty is 80, so the 40% pool splits 60/80 and 20/80.

- Corp A reserves 0.4 x 60/80 = **30%** of market demand at its own price.
- Corp B reserves 0.4 x 20/80 = **10%**.
- The remaining 60% goes to whoever is cheapest.

Now Corp A raises its posture from a norm of +5% to +15%, a 10 point jump. That is gouging. If it holds the new price, its norm only moves a tenth of the remaining gap per turn, so the gap stays above 8 points for three turns (10, 9, 8.1 points) and costs 10 points each time: 30. Then six turns of erratic pricing cost another 6. Corp A falls from 60 to about 24 and its reserved slice shrinks from 30% to about 22% of demand (24/44 of the pool, if B is still at 20).

## Playing for it

- **Pick a lane and hold it.** A steady discounter earns "value brand" loyalty and a steady premium seller earns "prestige" loyalty. Both count.
- **Change prices in small steps.** Moves under 4 points from your norm are free. Raising price more than 8 points at once is the costly move.
- **Do not ride a shortage up.** When a scarce commodity spikes, holding your price can earn loyalty from customers your gouging rivals push away.
- **Cut prices if you must.** A cut that leaves you more than 4 points off your norm costs only 0.5 per turn, far less than a hike.
- **Check your tier** on the corporation page header and Overview tab. Set posture per sector in the CEO operations table.

Applies in worlds where the loyalty market is on, which is the normal setting for new worlds; elsewhere no tier appears and clearing is purely cheapest-first. Where loyalty is tracked but the slice is not yet applied, your tier still builds but fills do not change. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
