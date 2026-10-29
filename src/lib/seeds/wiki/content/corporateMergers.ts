export const corporateMergersContent = `# Corporate Mergers & Acquisitions

You can offer to buy another corporation outright, whether a player or a computer runs it. You name a price for the whole corporation and choose what happens afterwards: **Merge** it into your own corporation, or **Keep as subsidiary** and leave it running. If the combined firm would dominate a national industry, the deal is first sent to a government minister for review.

This is separate from a [hostile takeover](/wiki/corporations#privatization-buyouts), which squeezes out minority shareholders once you already control a corporation. An acquisition offer is how you buy a corporation you do not yet control.

## How it works

1. **Offer.** You search for a target and propose a price for the whole corporation, with an outcome (Merge or Keep as subsidiary). The offer stays open for 24 turns.
2. **Answer.** A player-run target accepts or rejects from its own Deals tab. A computer-run target accepts at once if your price is at or above its asking price, which is the reference valuation plus 10%.
3. **Review.** If the combined firm would hold too large a share of a national industry, the deal stops here and goes to the reviewing minister (see below). Otherwise it continues.
4. **Close.** You pay the price, the target's shareholders are cashed out, and the target's assets move to you.

**Reference valuation.** Next to your price the game shows an independent fair-value estimate. It is built from the target's share price times its shares, its cash, and the replacement cost of its plants. You do not have to pay it. It lets both sides see whether an offer is generous or a lowball.

## Key numbers

| Item | Value |
| --- | --- |
| Offer stays open | 24 turns |
| Asking price of a computer-run target | reference valuation plus 10% |
| Minister's time to rule | 6 turns |
| Time to sell down after a conditional clearance | 12 turns |
| Fine while a sell-down is overdue | 5% of your group's revenue in that industry, every turn |
| Review trips at (Case-by-Case Review) | 75% combined share |
| Review trips at (Active Enforcement) | 60% combined share |
| Review trips at (Structural Enforcement) | 50% combined share |
| Review trips at (Open Markets Charter) | 40% combined share |
| No enforcement | review never trips |
| Timeout fallback: clears | less than 5 points over the trip level |
| Timeout fallback: clears with a sell-down order | 5 to under 15 points over |
| Timeout fallback: blocked | 15 points or more over |

## What you can do

**As the buyer.** Open the Deals tab on your corporation page, search for a target by name (any country, so cross-border deals are allowed) and enter a price. You can withdraw an offer until it is answered.

You cannot make an offer when:

- the target is your own corporation or is state-owned (these are not for sale);
- you already have an open offer on that target;
- the target is a computer-run corporation that another corporation controls, since that parent decides whether it is sold;
- your corporation is under an **overdue** sell-down order from a past review. An order that is still within its deadline does not stop you.

**As the target's CEO.** Accept or reject from your Deals tab. Accepting is final once processed. Check the offer against the reference valuation, and remember that on a merge your corporation is deleted.

**Choosing Merge or Keep as subsidiary.**

- **Merge** folds everything into your corporation and deletes the target. Choose it when you want one balance sheet and no separate management. A target with unpaid bonds or with shares in other corporations cannot be merged yet: you get an error and the deal does not move.
- **Keep as subsidiary** pays the shareholders the same way, but the target survives with its sectors, cash, bonds, bank charter and management. You become its only shareholder. Choose it to keep a company running as it is, or to buy a company that carries bonds. It is refused if it would chain subsidiaries, create circular ownership, or put one player in charge of both parent and subsidiary. See [Subsidiary Corporations](/wiki/subsidiary-corporations) for what you can do afterwards.

**Pricing tips.** Start from the reference valuation. A player CEO will compare your price with what they could get on the stock market, so a premium helps. If you are short of cash when the deal closes, it fails before anything moves. Keep cash for the full price.

## What happens when a merge closes

1. You pay the agreed price. If you do not have the cash, the deal fails with nothing changed.
2. Every shareholder of the target is cashed out from that price, the same payout method used in nationalization buyouts.
3. The target's own cash moves to you on top of the price. This is not double counting: the price went to the people who owned the shares, and the cash sitting inside the company is a separate asset that stays with it.
4. Every sector of the target moves to you with no loss of value, converted into your currency where needed.
5. The target corporation is deleted. Any other open offer naming it, on either side, is withdrawn.

Under **Keep as subsidiary** the target is not deleted, and nothing but the shares changes hands.

## Worked example

You offer ₳40,000,000 for a rival with a reference valuation of ₳36,000,000 and ₳3,000,000 of cash. Its shareholders receive ₳40,000,000. You also receive its ₳3,000,000 of cash and all its sectors, so you paid ₳37,000,000 net for the sectors. If the rival had been computer-run, the lowest price it would accept is 36,000,000 x 1.10 = ₳39,600,000.

Suppose the combined firm would hold 68% of an industry in the target's country, which has Active Enforcement (trip level 60%). The deal is referred. If the minister does nothing for 6 turns, the margin is 68 - 60 = 8 points, which is between 5 and 15, so it clears with a sell-down order. You then have 12 turns to bring your group's share of that industry below 60%. If you miss the deadline and your group earns ₳2,000,000 in that industry, you pay 5% = ₳100,000 every turn until you comply, and you cannot open new offers.

## Merger review

**Why it exists.** Without a check, one player could buy every rival in an industry. The review gives a country's competition authority a say before that happens.

**When it applies.** Both corporations must be privately owned. The target's country must not be a command economy, must have a competition law, and must have a live minister in the reviewing seat. Review is checked at the moment two firms would combine, for an agreed acquisition and for the squeeze-out that ends a hostile takeover.

**What trips it.** The combined share of the national industry where the two corporations overlap most, counted only inside the target's home country. The trip level depends on that country's competition law (see the table above). At "No enforcement" there is no review.

**Who decides.** The cabinet seat that country gives the job. The seat's name depends on the country and era: for example the Attorney General in the United States, the Business Secretary in Britain (the Board of Trade in 1953), and trade, commerce, economy or internal trade ministers elsewhere. Whoever holds the seat now decides, and if it changes hands mid-review the new holder takes over the queue. The same seat rules on index listing petitions (see [Index Funds](/wiki/index-funds)).

**What they can decide.** Clear it, block it, or clear it on condition that you sell down the overlapping industry. If nobody rules within 6 turns, the published bands decide, with no hidden roll.

\`\`\`wiki-chart
merger-review-timeout-outcomes
\`\`\`

**Blocked is final.** A blocked pairing cannot be retried. A cleared one does not need a second referral, so a hostile takeover that was referred and then cleared can simply be run again.

**A conditional clearance.** You have 12 turns to sell down until your controlled group (you plus every corporation you control more than 50% of) holds less than the trip level in that industry. Moving the business into a subsidiary changes nothing, because the group's share is the same. The order only ends when the group's share really falls.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): ownership, cash, sectors and share prices set the price and the combined market share.
- [Stock Market](/wiki/stock-market): the target's share price feeds the reference valuation.
- [Nationalization & National Corporations](/wiki/nationalization): state-owned corporations cannot be bought and are outside review.
- [Subsidiary Corporations](/wiki/subsidiary-corporations): the subsidiary outcome and the rules about chains and one-person control come from there.

**Affects**

- [Subsidiary Corporations](/wiki/subsidiary-corporations): Keep as subsidiary creates a formal parent and subsidiary.
- [Index Funds](/wiki/index-funds): the reviewing minister also rules on index listing petitions.
- [Corporations](/wiki/corporations): a merge deletes the target and moves its sectors and cash to the buyer.

## Status

Acquisition offers work in every world that has the Deals tab. If your world has acquisitions switched off, the tab says so. The Keep as subsidiary outcome is offered only in worlds with subsidiaries. Merger review exists only in countries with a competition law and a reviewing seat in the current era, and never applies to state-owned corporations or command economies.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules, formulas and constants are on the [Corporate Mergers and Acquisitions design page](https://docs.lakesidegames.net/design/corporate-mergers-and-acquisitions.html).
`;
