export const defenceProcurementContent = `# Defence Procurement

Recruiting units and paying for equipment are two different systems. This page is about the second one: how the defence appropriation turns into materiel, who suppliers can be, and the guardrails that stop the budget turning into free cash for whoever holds the defence chair. See [Units, Recruitment & Procurement](/wiki/military-units) for unit costs and upkeep.

## How it works

The defence seat publishes a tender for equipment. Eligible domestic corporations bid inside a price band. After bidding closes the government picks a winner and the order starts. The winning plant builds lots of materiel and delivers them to the national arsenal a few at a time, paid from the defence appropriation. New units then draw their equipment from the arsenal, and the grade of that equipment sets the starting tech tier of the unit. The rest of this page is the guardrails.

![Tender lifecycle from publishing and sealed bids to award, production lines and deliveries, then completion or termination for cause or for convenience.](/wiki-images/diagrams/defence-procurement-tender-lifecycle.svg)

### Key numbers

| What | Value |
| --- | --- |
| Contracting window | 12 turns (a quarter of a game year) |
| New obligations per window | About 45% of the annual defence line, prorated to the window |
| Share one private supplier may take | One third of the window |
| Share a state-owned supplier may take | The whole window |
| Payout per turn | At most 3 times the steady procurement income |
| Production lines per plant | 4, shared across its orders |
| Equipment grades | 0 to 3, priced at 0.7, 0.85, 1.0 and 1.25 times the base lot price |
| Lowest margin over cost | 12% |
| Self-dealing stake that triggers disclosure | 5% of shares, or owning the company |
| Self-dealing political penalty | 1.5 to 8 favorability points |
| Missed delivery turns for a free termination | 3 in a row |
| Break fee for ending a working order | The supplier's margin on the lots not built |

### A worked tender

Suppose a country's annual defence line is 100,000 (in its own budget units). Its window allows about 100,000 × 0.45 × 12 / 48 = 11,250 of new orders, and one private supplier may take a third of that, 3,750. The minister tenders 100 lots, with a maximum of 100 a lot, so 10,000 is reserved. A private supplier can only be awarded 37 lots, so the tender is split or a state-owned plant is used.

Say the winning supplier gets 37 lots at 100. The steady income is 100,000 × 0.45 / 48 = 937.5 a turn, so a private supplier can be paid at most 937.5 a turn, or 9 lots. The 37 lots therefore take at least 5 turns, even if the plant could build them faster. If the minister ends the order for convenience when 10 lots are delivered, and the cost to build is 85 a lot, the break fee is the margin of 15 on each of the 27 undelivered lots, which is 405. The fee comes out of the appropriation at once.

## Who awards contracts

The defence seat holder publishes equipment tenders against the national defence appropriation. An **acting** secretary uses the same authority as a confirmed holder. The Cabinet Office's **Government Contracts** tab opens the country board; the Arsenal tab retains stock, deliveries and signed orders.

A tender fixes the component, number of lots, required grade and maximum price per lot. The maximum price is checked against the lowest current price floor for that component and grade before the tender is published; if it is too low, the tender is refused and the minimum is shown in national budget units. Eligible domestic corporations nominate a certified plant and bid a price within the permitted band. Bid values stay sealed until closing; CEOs can revise or withdraw their own bid before then. The government selects a qualifying bid after closing and publishes its reason. The winning bid activates the order without another acceptance step.

Publishing reserves the maximum obligation. Award transfers the actual winning value into the contract and releases the difference. The supplier concentration cap still applies. Defence bidding and award deadlines must fit inside the current quarterly contracting window.

The country board has **Active Bidding**, **Bidding Closed**, **Awarded** and **Canceled** tabs, type filters and ten results per page. An interrupted award remains in Bidding Closed so the government can resume it.

A country under a **demilitarisation** settlement (see [Peace, Indemnities & Truces](/wiki/peace-and-truces)) may award no new contracts, and no company may accept a new order from it, until the bar lapses. Live contracts keep delivering.

## Planned economies

The Soviet Union and East Germany receive **state arms industry** output independently of tenders: a fixed number of lots each turn, delivered straight to the arsenal and aimed at the branch furthest from a full load. Eligible state-run suppliers and AI-run defence companies also submit an initial suggested-price bid when a tender opens. They use the same country, currency and component eligibility checks as player suppliers; they do not receive a direct-award shortcut. Player corporations run by a caretaker CEO still make their own bidding decisions. See [Units, Recruitment & Procurement](/wiki/military-units).

## Contracting windows

Contracts are budgeted in quarterly tranches, not against an open-ended future stream. Each country gets a new contracting window every 12 turns (one quarter of a game year). Inside one window:

- The country's total new obligations are capped at roughly 45% of its annual defence line, scaled to the window (the other 55% is assumed to be sustaining the seeded force, not buying more of it).
- **No private supplier may take more than one third of that window's tranche.** This is the concentration cap: it stops a minister emptying the entire quarter's procurement budget into a single corporation.
- **State-owned industry is exempt from the one-third cap.** In a command economy the buying country typically seeds one National Corporation per sector, so applying the private-supplier cap there would leave two thirds of the window unspendable with no other plant able to use it. A National Corporation has no player CEO who personally profits from the award, which is the reason the cap exists in the first place.

When the window rolls over, unspent capacity does not carry forward and a fresh tranche opens.

## The price band and why cost tracks price

A lot's price is anchored to a GDP-scaled figure and does not move turn to turn just because a plant's input costs do. What DOES move is the plant's production cost: it is priced off the live commodity market, using the same world price-ratio the plant's own turn economics use, so a lot's cost floor and a plant's actual input bill move together instead of drifting apart. A supplier building lots in a world where steel has gotten expensive pays more to build them; a minister paying 1953-era prices for a contract struck when commodities were cheap does not get to keep quoting that price forever, because cost is re-derived from the live market on each delivery sweep.

The gap between what a lot sells for and what it costs to build is the supplier's margin. This margin is the entire economic point of a defence contract: it is deliberate profit for the arms industry, not free money. Contracts written before this cost model shipped keep settling on the terms they were signed under; that is not something you as a player can trigger or exploit going forward, it only matters for very old, already-existing contracts.

## The self-dealing check

Every award is checked for whether the minister writing it has a stake in the corporation receiving it:

- **Owner.** The same player controls both the ministry and the corporation (checked against the corporation's appointing owner, so installing a caretaker CEO does not launder the relationship).
- **Material shareholding.** The minister personally holds 5% or more of the corporation's shares.

A self-dealt award is not blocked. It is disclosed publicly, on the order book, in plain language: who awarded it, what stake they hold, how many lots, and what it's worth. The minister also takes a favorability hit that scales with how much of the country's procurement tranche the contract represents: a token order to a company you own costs almost nothing, but routing a large share of the quarter's whole budget to yourself is a real political event. The penalty is capped, so no single award ends a career outright, but it is designed to make a big self-dealt contract genuinely costly to sign.

## Tearing up a contract

A contract can be cancelled by the minister who holds the defence seat, and how much that costs depends entirely on which of three things it is.

**Canceling an unawarded tender.** The minister publishes a reason and the reserved appropriation and quarterly capacity are released. An unawarded tender also expires at its award deadline. Once a winning bid has become an order, ending it follows the cause or convenience rules below. Historical withdrawn offers remain in the records; new awards do not wait for a second CEO acceptance.

**Terminating for cause.** If a plant misses three delivery turns in a row for a reason of its own making, the contract can be torn up for free and the tranche is handed back. The three supplier-side reasons are: the plant produced nothing, the supplier is no longer eligible to be paid from the appropriation, or input prices overtook the struck price and the supplier cannot fund the loss. A buyer running out of appropriation is NOT one of them: underfunding your own defence budget does not earn you a free cancellation.

**Terminating for convenience.** Anything else. The supplier accepted, the plant is working, and the minister has decided the order should stop. Three things follow:

- **A break fee.** The supplier is paid its margin on every lot it was ordered to build and now will not. This comes out of the defence appropriation, and it comes out immediately. If the appropriation cannot cover the fee, the termination is refused: a minister does not get to walk away and leave the company holding the bill.
- **The tranche stays spent.** The cancelled lots are NOT returned to the contracting window. Cancelling an order does not create room to award a new one this quarter, to anyone, including yourself.
- **Public disclosure and a political price.** The cancellation goes on the wire with the minister's name on it, and they take a favorability hit that scales with how much of the quarter's procurement the order was. If the minister holds an interest in a different domestic defence supplier, one that competes for the same work, the wire says so and the penalty doubles.

The break fee is always less than what delivering the rest of the order would have cost, so getting out of a contract the country genuinely does not need is still the cheaper option. What it is not is free, and it is no longer invisible.

## The turn spend cap

The window cap limits how much a country can OBLIGATE across a quarter. It does not, by itself, limit how fast an already-obligated contract PAYS OUT. A large committed contract could otherwise be delivered in one or two turns, moving an entire quarter's defence appropriation into one corporation's cash balance in a single tick.

\`\`\`wiki-chart
defence-turn-spend-cap
\`\`\`

To stop that, deliveries are also throttled per turn:

- Each turn, a country can pay suppliers at most three times its normal per-turn procurement income (its annual defence line's procurement share, divided evenly across the year).
- Within that, one private supplier can be paid at most its capped share of the country total (the same one-third share used for awards); state-owned industry can take the full country cap.
- There is always a one-lot floor: if a country has paid nothing yet this turn, at least one lot goes through even if its price exceeds the strict cap, so a small country's contract is never permanently stuck.

Because the per-turn cap is three times the steady rate and a window is twelve turns, the cap can never reduce what a legitimate buyer spends across a full window; it only prevents a whole quarter's budget landing in one or two turns.

## What this means for you

- If you hold the defence seat, plan contracts against the quarterly tranche, not against however much cash the treasury happens to be holding.
- Awarding to your own corporation is legal but public and costly. Small orders are close to free politically; large ones are not.
- Cancelling a rival's contract is legal too, and it now costs you money, tranche room, and standing. Check the quoted break fee on the cancel button before you confirm it.
- If you supply defence contracts, an order that gets torn up mid-build pays you the margin you were promised on the rest of it. You will be notified, and the reason is on your order book.
- Deliveries on a large contract will spread across several turns even after the contract is signed. That is the spend cap working as designed, not a bug.
- State industry in a command economy can absorb a whole window's tranche where private suppliers cannot; this is intentional, not an oversight.

## What you can do

- **Defence seat holder:** publish, award and cancel tenders at the Cabinet Office **Government Contracts** tab. Delivery and termination controls are in **Military**, **Arsenal**.
- **Corporation CEO:** nominate a plant, bid, revise or withdraw before closing, and assign production lines.

![Government Contracts board with the Active Bidding, Bidding Closed, Awarded and Canceled tabs and open defence tenders](/wiki-images/screens/defence-procurement-contract-board.webp)

Common questions: *Why is my tender refused as below the price floor?* Your maximum price per lot is below the lowest floor for that component and grade; the refusal shows the minimum. *Why are deliveries spread over several turns?* The per-turn spend cap. *Can I cancel a contract for free?* Only for cause. *Does my own corporation winning the award cost me?* Yes, in disclosure and favorability.

## Connections

**Driven by**

- [Units, Recruitment & Procurement](/wiki/military-units): the appropriation and the arsenal are shared with unit purchase and upkeep.
- [Peace, Indemnities & Truces](/wiki/peace-and-truces): a demilitarisation settlement bars new contracts for its length.
- [Cold War Tension](/wiki/cold-war-tension): the tension band changes procurement demand.
- [Corporations](/wiki/corporations): only domestic defence plants can be awarded orders.
- [Global Response Crises](/wiki/global-response-crises): tension raises strategic procurement demand

**Affects**

- [Units, Recruitment & Procurement](/wiki/military-units): delivered lots stock the arsenal that equips new units and refits old ones.
- [Corporations](/wiki/corporations): a contract pays the supplier its margin.
- [The Nuclear Programme](/wiki/nuclear-programme): warhead production is paid from the same defence budget.

## Status

Defence contracts run in every world where the buying country has a defence seat and a usable budget and GDP. Contracts are domestic only, with the buyer and supplier in the same country and currency. The Soviet Union and East Germany also receive passive state arms output.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Every constant, its source file and the full formulas are on the design page [Defence Procurement](https://docs.lakesidegames.net/design/defence-procurement.html).

See also: [Units, Recruitment & Procurement](/wiki/military-units), [Corporations](/wiki/corporations), [Conflicts & the Military System](/wiki/conflicts-overview).
`;
