export const supplyAgreementsContent = `# Supply Agreements

Your steel plant needs ore every turn, and on the open market every order clears **cheapest-first**, so you have no say in who you trade with or whether the ore is there. A **supply agreement** fixes that. It is a private, standing contract in which one corporation (the supplier) commits to sell a commodity to a named buyer. The contracted volume is filled before the open market, so the buyer gets guaranteed inputs and the supplier gets guaranteed sales.

## What a contract does each turn

An agreement covers one commodity between two corporations. When the market clears:

1. **The buyer's demand is filled from the supplier's output first**, up to the contract's volume cap and what the supplier actually makes.
2. **The supplier's excess** flows to the open market as normal.
3. **If the supplier makes less than it promised**, the buyer covers the gap on the open market and the supplier pays the buyer damages.

So a contract is a *priority claim*, not magic supply. It moves the buyer to the front of the queue; it cannot create goods that were never made. Overall, demand clears in this order: contracted first, then the loyal slice (the reserved share for loyal customers, see [Brand Loyalty](/wiki/brand-loyalty)), then cheapest-first for everything left. The full picture is in the [Market System guide](/wiki/market-system-guide), and contracted volume leaves the [open commodity market](/wiki/commodities) before cheapest-first clearing begins.

## Making a deal

Open your [corporation](/wiki/corporations) page and use the **Supply agreements** section. Pick a commodity, a counterparty, a volume cap, a price premium or discount, a term and whether it is exclusive. The other side must accept, and counter-offers are possible until both agree. Corporations can also post standing offers; accepting one forms the contract.

![Supply agreement lifecycle from offer and counter-offers to active, cancel notice and cancelled or expired.](/wiki-images/diagrams/supply-agreements-lifecycle.svg)

| Rule | Value |
| --- | --- |
| Price band | Contract price must stay within -35% to +35% of the market price |
| Fixed term | 4 to 192 turns, or open-ended |
| Volume cap at signing | At most 1.2 times what the supplier's plants can physically make (20% headroom) |
| Damages for a shortfall | 50% of the market value of the units not produced |
| Damages ceiling per turn | 25% of the contract's own value (volume cap times unit price) |
| Cancel notice, open-ended | 4 turns |
| Cancel notice, fixed term | A quarter of the turns left, at least 4 and at most 24, never past the end date |
| NPP auto-accept | Inbound offer from a player at up to +20% over market, when the NPP consumes the commodity |

The two sides agree a price as a premium or discount on the market price. The band keeps it honest: it cannot fall far below (a disguised gift) or rise far above (gouging a captive partner). Each turn the buyer still pays the market price through clearing, and the premium is settled between the two corporations on top: a positive premium moves cash from buyer to supplier, a negative one the other way.

Size the cap to what you reliably make. Nameplate capacity, which comes from your plants (see [Running a Corporation under the Plants System](/wiki/plants-corp-guide)), is your best possible turn, and contracting at it turns every ordinary bad turn into a shortfall. To get a supplier to guarantee your inputs, offer a contract slightly above market, sized below what its plants make.

**Exclusive** contracts mean the supplier sells that commodity only to the buyer, with no open-market sales. A pair can lock up a scarce commodity and starve rivals, but the supplier has tied up all its output. NPP corporations accept offers from a player when they actually consume the commodity and the premium is within +20%. They never spam players with offers, and they give cancel notice before a mothballed plant starts paying damages. If a counterparty leaves the game, the agreement is retired automatically.

Freight contracts name the state they are fulfilled in, because haulage is based in one state, and they reserve haulage there. See [Logistics](/wiki/logistics-guide).

## When the supplier falls short

Damages are measured against what your plants could actually have made that turn, not against the number on the contract. If inputs ran short, a strike hit, or the market was so glutted that production throttled back, the ceiling drops and so do the damages. A weak market for your goods is also not a breach, because the test is production, not sales.

What stays fully chargeable are choices you control: turning production down, or mothballing a plant that still has a live contract. If you make nothing at all, the whole contracted volume counts as the shortfall. The side that owes pays what it has and no more. Shutting a plant down means owing half the market value of the shortfall each turn, up to the 25% ceiling, until the notice period ends.

Contracts signed before this rule existed, with no physical check at signing, are exempt from damages until the parties re-sign.

A steel supplier agrees to deliver up to **1,000 units** per turn to a buyer at a **+20% premium**. That is inside the +35% band, which at a market price of 100 tops out at 135. Its plants can make 1,200 units, so the 1,000 cap passes the 1.2 times check.

One turn a strike cuts what it can make to **700 units**. The shortfall is 300 units, so uncapped damages are 300 x 100 x 0.5 = **15,000**. The ceiling is 0.25 x 1,000 x 100 = 25,000, so the full 15,000 is paid. The buyer buys the missing 300 units on the open market and is compensated for part of the extra cost.

Had the supplier made nothing, the shortfall would be 1,000 units: 1,000 x 100 x 0.5 = 50,000, cut to the 25,000 ceiling.

## Leaving a contract

Either side can serve notice. The contract keeps delivering and settling, damages included, until the notice ends, so you cannot dodge a bad turn by cancelling.

Contracts do help your brand a little: contracted sales count as sold output, which helps your fill rate, and delivering what you offer is part of how Brand Loyalty is earned. There is no separate bonus.

Applies in worlds where private contracts are on, which includes current worlds. Damages and the volume check apply from the plants stage of the market system, the normal setting for new worlds. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
