export const supplyAgreementsContent = `# Supply Agreements

A **supply agreement** is a private, standing contract in which one corporation (the supplier) commits to sell a commodity to a named buyer. The contracted volume is filled before the open market, so a buyer gets guaranteed inputs and a supplier gets guaranteed sales. Without one, every order clears **cheapest-first** and you have no say in who you trade with.

## How it works

An agreement covers one commodity between two corporations. Each turn, when the market clears:

1. **The buyer's demand is filled from the supplier's output first**, up to the contract's volume cap and what the supplier actually makes.
2. **The supplier's excess** flows to the open market as normal.
3. **If the supplier makes less than it promised**, the buyer covers the gap on the open market and the supplier pays the buyer damages.

So a contract is a *priority claim*, not magic supply. It moves the buyer to the front of the queue; it cannot create goods that were never made.

### Clearing order

Each turn, demand is satisfied in this order:

1. **Contracted**: supply agreements.
2. **Loyal slice**: the reserved share for loyal customers (see [Brand Loyalty](/wiki/brand-loyalty)).
3. **Cheapest-first**: everything left clears on the open market.

### Key numbers

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

### The price band

The two sides agree a price as a premium or discount on the market price. The band keeps it honest: it cannot fall far below (a disguised gift) or rise far above (gouging a captive partner). Each turn the buyer still pays the market price through clearing, and the premium is settled between the two corporations on top: a positive premium moves cash from buyer to supplier, a negative one the other way.

### Damages, and what you are not charged for

Damages are measured against what your plants could actually have made that turn, not against the number on the contract. If inputs ran short, a strike hit, or the market was so glutted that production throttled back, the ceiling drops and so do the damages. A weak market for your goods is also not a breach, because the test is production, not sales.

What stays fully chargeable are choices you control: turning production down, or mothballing a plant that still has a live contract. If you make nothing at all, the whole contracted volume counts as the shortfall. The side that owes pays what it has and no more.

Contracts signed before this rule existed, with no physical check at signing, are exempt from damages until the parties re-sign.

### Worked example

A steel supplier agrees to deliver up to **1,000 units** per turn to a buyer at a **+20% premium**. That is inside the +35% band, which at a market price of 100 tops out at 135. Its plants can make 1,200 units, so the 1,000 cap passes the 1.2 times check.

One turn a strike cuts what it can make to **700 units**. The shortfall is 300 units, so uncapped damages are 300 x 100 x 0.5 = **15,000**. The ceiling is 0.25 x 1,000 x 100 = 25,000, so the full 15,000 is paid. The buyer buys the missing 300 units on the open market and is compensated for part of the extra cost.

Had the supplier made nothing, the shortfall would be 1,000 units: 1,000 x 100 x 0.5 = 50,000, cut to the 25,000 ceiling.

## What you can do

- **Offer or accept a contract.** Open your corporation page and use the **Supply agreements** section. Pick a commodity, a counterparty, a volume cap, a price premium or discount, a term and whether it is exclusive. The other side must accept. Counter-offers are possible until both agree.
- **Take a listing.** Corporations can post standing offers; accepting one forms the contract.
- **Cancel.** Either side can serve notice. The contract keeps delivering and settling, damages included, until the notice ends, so you cannot dodge a bad turn by cancelling.
- **Make a deal with an NPP corporation.** They accept offers from a player when they actually consume the commodity and the premium is within +20%. They never spam players with offers, and they give cancel notice before a mothballed plant starts paying damages.
- **Size the cap to what you reliably make.** Nameplate capacity is your best possible turn. Contracting at it turns every ordinary bad turn into a shortfall.

**Exclusive** contracts mean the supplier sells that commodity only to the buyer, with no open-market sales. A pair can lock up a scarce commodity and starve rivals, but the supplier has tied up all its output. If a counterparty leaves the game, the agreement is retired automatically.

Freight contracts name the state they are fulfilled in, because haulage is based in one state. See [Logistics](/wiki/logistics-guide).

### Common questions

- **How do I get a supplier to guarantee my inputs?** Offer a contract, ideally slightly above market, sized below what the supplier's plants make.
- **What do I owe if my plant shuts down?** Half the market value of the shortfall each turn, up to the 25% ceiling, until the notice period ends.
- **Does a contract help my brand?** Contracted sales count as sold output, which helps your fill rate, and delivering what you offer is part of how [Brand Loyalty](/wiki/brand-loyalty) is earned. There is no separate bonus.

## Connections

**Driven by**

- [Commodities](/wiki/commodities): the market price sets the ±35% band and the value of damages.
- [Running a Corporation under the Plants System](/wiki/plants-corp-guide): plant capacity and output set how much you can promise and whether you fall short.
- [Corporations](/wiki/corporations): the corporation page is where offers are made and managed.

**Affects**

- [Brand Loyalty](/wiki/brand-loyalty): guaranteed sales improve fill rate.
- [Commodities](/wiki/commodities): contracted volume leaves the open market before cheapest-first clearing.
- [Market System: A Player's Guide](/wiki/market-system-guide): contracts fill first in the clearing order.
- [Logistics: Freight, Sourcing, and Supply Chains](/wiki/logistics-guide): freight contracts reserve haulage in one state.

## Status

Supply agreements run in worlds where private contracts are on, which includes current worlds. Damages and the volume check apply from the plants stage of the market system, which is the normal setting for new worlds.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

This system has no separate design page yet. Every number it uses is in the key numbers table above, and the market clearing around it is on [Commodities](/wiki/commodities).
`;
