export const stockMarketContent = `# Stock Market

Corporations are listed on country exchanges, where players buy and sell shares, collect dividends and bet on how companies will perform. A share price comes from what the company owns, what it earns and how fast it is growing, so the stock market is where a corporation's real performance becomes your wealth. It also decides who controls a company: voting weight follows shares.

## How it works

Each country has its own exchange, listing corporations headquartered there. The Market page has an exchange selector and shows market cap, share price, revenue, net income, CEO, sector and headquarters, with price history as candlestick charts (open, high, low and close for each period).

Prices are recomputed every 15 minutes from three parts of a company's value, added together:

> share price = 1.0 x tangible book + 0.5 x earnings power + 0.15 x growth premium (each per share)

| Part | What it measures |
| --- | --- |
| Tangible book (weight 1.0) | Cash, the present value of its sectors, construction in progress and tech assets, plus bonds it holds (counted at 75%) and 75% of the book equity of any bank it owns, minus bonds it has issued |
| Earnings power (weight 0.5) | A 3-turn average of yearly after-tax earnings, divided by the cost of capital (the prime rate plus a sector risk premium) |
| Growth premium (weight 0.15) | The value of future growth at the sector growth rate, capped just below the cost of capital |

The result is then adjusted: a rate limiter stops moves above 35% per turn, an insider discount applies when the CEO holds too much, and other adjustments are listed below.

### Key numbers

| Rule | Value |
| --- | --- |
| Update frequency | Every 15 minutes (earnings on the hourly turn) |
| Weights: book / earnings / growth | 1.0 / 0.5 / 0.15 |
| Bond holdings haircut | 0.75 |
| Minimum share price | 0.01 |
| Per-turn move limit | 35% (not applied at or below 1.00) |
| Insider discount | Up to -30%, starts when the character CEO holds more than 65% of shares |
| Corporate IMF restructuring | Price multiplied by 0.85 |
| Dividend rate | 0% to 25% of after-tax income |
| Public share issue | Up to 50% of shares; self-issue up to 20% at a 15% premium |
| Split limits | Forward up to 100x; reverse down to 1,000,000 shares; 48-turn cooldown |
| Post-split smoothing | 70% previous price, 30% fundamental, for 3 turns |
| Sell pacing | Pool absorbs at most 5% of company value per turn; sales under ₳25,000,000 never paced |
| Issue pacing | At most 10% of shares or ₳50,000,000 per turn, whichever is larger |
| Thin float | Public float under 5% trades at the fundamental price |
| Hostile takeover | At 75% ownership; minority paid 125% of market price |

### Worked example

A company has 10,000,000 shares, ₳2,000,000 of cash, sectors worth ₳6,000,000 in present value and ₳1,000,000 of bonds issued. Tangible book is 2,000,000 + 6,000,000 - 1,000,000 = ₳7,000,000, or **0.70 per share**.

Its yearly earnings are ₳1,200,000 and the cost of capital is 10%. Earnings power is 1,200,000 / 0.10 / 10,000,000 = **1.20 per share**. Sector growth is 4%, so the growth premium is 1,200,000 x 0.04 / (0.10 - 0.04) / 10,000,000 = **0.08 per share**.

The price is 0.70 + 0.5 x 1.20 + 0.15 x 0.08 = **1.312**. If the central bank raises rates so the cost of capital goes to 12%, earnings power falls to 1.00, the growth premium to 0.06, and the price to about 1.209, a drop of 8%. The same company in a boom can never rise more than 35% in a turn.

\`\`\`wiki-chart
share-price-by-cost-of-capital
\`\`\`

### Why it works this way

Tangible book carries the biggest weight so a company that reinvests into capacity is worth at least what that capacity is worth, even while current profit is low. Earnings and growth sit on top. Adjustments exist so no single holder or one-turn spike can distort a price.

Other adjustments to the price: bonds are counted at 0.75 so leveraged bond positions do not inflate value, and shares held by index funds get a small premium reflecting passive demand.

## Buying and selling shares

From a corporation page, navigate to the Shares tab, or use the **Trade** shortcut on a tradable stock in the exchange list.

### Market orders

Market orders use the quoted bid or ask. The equity pool's base half-spread is 1% on each side of its midpoint, before its cash-balance adjustment. Execution depends on available shares, cash and the applicable market path; liquidity is not unlimited. Review the trade quote before confirming.

Very large sales are paced. The market buys at most **5% of a company's value** each turn from all sellers together. Sales under ₳25,000,000 per company per turn are never limited; a bigger sell order fills a slice each turn at the market price and settles over more turns.

### Limit orders

Place a buy or sell order at a target price. The order sits on the book and fills automatically when the market price crosses your limit. You can set an optional expiry (cancel after N turns if unfilled).

- **Buy limit orders:** Funds are held in escrow until filled or cancelled
- **Sell limit orders:** Shares are reserved until filled or cancelled

### Partial fills

If insufficient liquidity exists at your limit price, the order fills partially: the matched portion executes, the remainder stays open.

### Order-flow price eligibility

Corporations with a **public float below 5%** of total shares do not use the live market price for order execution. Instead, trades fall back to the **fundamental share price** computed by the turn formula. This prevents a single concentrated holder from manipulating the order-flow clamp and round-tripping against their own quote.

## Dividends

The CEO sets a **dividend rate** (0 to 25% of after-tax income). Dividends are paid to all shareholders each turn in proportion to their share count. Higher dividend rates attract income-focused investors but reduce the corporation's reinvestment capacity.

Dividend rate changes have a **24-hour cooldown** before another change can be made.

## CEO share management

### Share issuance

- **Public issuance:** Issue up to 50% of outstanding shares to the public float (dilutes existing shareholders). Proceeds go to corporate liquid capital at the current execution price. Limited to once per 24 hours. The market places at most **10% of the company's shares, or ₳50,000,000 worth**, whichever is larger, in one turn, with the remainder filling over the following turns.
- **Self-issuance:** Issue up to 20% of outstanding shares to yourself as CEO at a 15% premium; proceeds go to corporate liquid capital. Also limited to once per 24 hours and shares the same issuance cooldown with public issuance.

### Stock splits and reverse splits

The CEO can change the total share count via a split or reverse split. All shareholders and the public float are scaled proportionally: ownership percentages stay the same, market cap is unchanged. Share price scales inversely to keep total value constant.

- **Forward split:** Up to 100x current total shares
- **Reverse split:** Down to a minimum of 1,000,000 total shares
- **Cooldown:** 48 turns between changes (also applies to share consolidation)
- **Open orders:** Any open share orders on the corporation are auto-cancelled and refunded when a split occurs

### Post-split price smoothing

For **3 turns total** (the turn the split happens plus the next 2 turns), the share-price formula uses **biased smoothing weights** to prevent the price from snapping back to the pre-split equilibrium immediately:

| Phase | Previous price weight | Fundamental weight |
| --- | --- | --- |
| Normal | 0% | 100% |
| Post-split cooldown | **70%** | **30%** |

The higher previous-price weight means the scaled price set by the consolidate route drifts gradually toward its natural equilibrium across multiple turns, rather than being overwritten by fundamental value on the very next turn. This cooldown applies to both forward splits and reverse splits.

## Share history

The **Shares tab** on every corporation page includes a full audit trail of every share movement:

| Event type | What it records |
| --- | --- |
| Issuance | CEO issued shares (public or self-issuance) |
| Market buy / sell | Trades against the public float |
| Limit fill | A limit order auto-filled or was manually filled |
| Peer fill | Another player filled your open order |
| Listing fill | A private listing offer was accepted |
| Takeover buyout | Hostile takeover forced a minority sale |
| Stock split | Forward split with before/after shareholder register |
| Reverse split | Reverse split with before/after shareholder register |

### Split audit rows

When a CEO drives a stock split or reverse split, the history records an expandable row showing:
- **Old total shares → new total shares**
- **Old share price → new share price**
- **Old public float → new public float**
- **Full shareholder register before and after**, including each holder's name, share count, and percentage

This lets any player audit structural changes and verify that ownership percentages were preserved and that no holder was accidentally dropped during the restructure.

## CEO elections (shareholder vote)

When the CEO office is vacant, shareholders can vote for candidates. The vote is **weighted by shares**: 500 shares = 500 votes, not one vote per holder.

**Candidate eligibility:**
- Must be located in the corporation's **HQ state**
- Must be in the corporation's **home country**
- Self-voting is allowed

The leading candidate (highest share-weighted vote total) receives a pending CEO offer notification. They must accept the position before taking office.

## Corporate ownership and subsidiaries

Corporations can hold shares in other corporations. When one corporation holds **more than 50% of another corporation's voting power**, it becomes that corporation's controlling parent. Voting power is not the same as share count where a corporation has issued supershares. The largest corporate stake above 50% wins ties.

Control on its own makes the target a **de facto subsidiary**: the relationship shows on the corporation page and on the exchange, and it feeds cross-holding calculations in the share-price formula.

**Managing** a subsidiary is a separate, deliberate step. The parent's CEO must **formalize** the relationship, and only then can the parent:

- inject capital into the subsidiary (capped per injection, with a cooldown)
- set a dividend floor the subsidiary must pay out
- appoint the subsidiary's CEO

A formalized subsidiary cannot issue new equity, cannot itself act as a parent to another corporation, and cannot be released again until it has been held for a minimum period. A corporation can never buy into a corporation that already controls it, directly or through a chain: circular ownership is refused at the point of purchase.

Profits do **not** consolidate. Each corporation is taxed on its own sectors, and a parent sees its subsidiary's earnings through dividends and through the share price, not as its own operating income.

## Corporate groups

A parent and its **formalized** subsidiaries form a **group**. De facto control is not enough: the group is the set of relationships the parent has actually declared.

**Group balance sheet.** The corporation page shows the consolidated position of the whole group, combined cash, combined revenue, every member, every industry and country it operates in. It is a view, not a merger: members keep their own balance sheets, share prices and shareholders. Group size is visible to everyone, not just the parent's CEO. A structure should be a way to organise a business, not a way to disappear.

**Group loss relief.** Within a single country, a group's losses are surrendered against its profits, and the group is taxed on the net. A parent earning ₳1,000,000 alongside a subsidiary losing ₳250,000 is taxed as though it earned ₳750,000; the tax on the sheltered ₳250,000 is refunded from the treasury that collected it, split across the members that actually paid.

Four limits, all of them deliberate:

- **Same country only.** A loss in one country cannot shelter a profit in another.
- **Losses cannot exceed profits.** A ₳5,000,000 loss against a ₳1,000,000 profit relieves ₳1,000,000. There is no carry-forward.
- **Relief never exceeds the tax the group actually paid.** The state refunds; it does not pay out.
- **Formalized subsidiaries only.** Relief is bought with a declaration.

That last point is the trade. Formalizing a subsidiary is what unlocks relief, and it is also what makes the group legible, to everyone reading the corporation page, and to the competition authority reviewing your next merger.

## Group synergies

A group is not only a tax structure. Each turn, its members converge toward the group's **best** marketing and logistics capability, closing 5% of the gap per turn, up to 60% of the leader's level.

**Synergy only ever lifts.** No member is reduced to bring the group toward an average. Averaging would mean acquiring a weak subsidiary drags your strong parent down, and the optimal move would be to never group anything, which is not what a group is for. The strong member's distribution network and brand are what the weak one gets access to, not the other way round.

A member already above the capped share gains nothing. There is no reason to hold a flagship back.

**A spin-off carries the brand out with it.** A corporation spun off from a group member keeps a higher ceiling, 85% instead of 60%, for two game years, because last turn it was literally part of that business. The advantage decays as the spin-off becomes its own company, and it disappears immediately if the corporation it came from leaves the group.

## Transfer pricing

Supply agreements carry an agreed price offset from market. Between two unrelated corporations that is a negotiation. Between two members of the same group it is a dial: both sides have the same owner, so the price decides which member books the profit, and when those members sit in **different countries**, it decides which treasury collects the tax.

Price an intra-group cross-border contract away from market and the shifted profit accumulates as **exposure** on that contract. Cross ₳5,000,000 of accumulated exposure and the treasury that lost the base reassesses: it charges the tax that was avoided, plus a **40% surcharge**, and the exposure resets to zero.

The surcharge is the point. Without it an assessment is a free option, worst case, you pay exactly the tax you owed anyway, later.

Three things worth knowing:

- **It is deterministic.** No dice. You can work out precisely how many turns a given position survives, which makes aggressive pricing a calculated risk rather than a gamble.
- **A position you unwind stops accruing.** Price aggressively for a while and return to market before the threshold, and you have taken a real risk and got away with it.
- **Small offsets are ignored.** Anything within 5% of market is ordinary commercial pricing, not a tax position.

Same-country intra-group pricing is not audited at all: both sides pay the same treasury, so no base moves, and group loss relief already nets the two positions against each other.

An assessment you cannot afford is not waived. It is collected as far as your balance goes, and the exposure resets either way.

## Hostile takeovers

When a corporation (the acquirer) holds **at least 75%** of a target corporation's shares, the acquirer's CEO can initiate a **hostile takeover**:

- **Minority buyout:** All remaining minority shareholders are paid **125% of the current market price** per share (forex-aware)
- **Sector merge:** Overlapping sectors (same state and sector type) are combined, summing revenue, workers, and margins
- **Unique sectors:** Sectors that don't overlap are reassigned to the parent
- **Cash transfer:** The target's liquid capital is transferred to the parent
- **Orders cancelled:** All open share orders and listings on the target are cancelled
- **Debt and distress:** A hostile squeeze-out may target an insolvent corporation and reassigns unmatured bonds to the parent. Insolvency and outstanding-bond guards apply to agreed acquisitions, not this hostile path.

## Stock exchange index

The exchange page shows aggregate stats for all listed corporations:
- Total market capitalization
- Average share price movement
- Top movers (largest price % change)

National GDP growth is influenced by corporate sector growth rates, so a healthy stock market generally reflects a growing economy, and vice versa.

## Currency

Each exchange displays values in that country's currency. If you hold shares in a UK corporation, dividends are paid in GBP. Dividends are automatically converted to your home currency at the market-maker rate (1% spread). There is no per-holding preference: this conversion is automatic for all dividend income.

## Strategic considerations

**Income investors:** High-dividend corporations pay consistent per-turn income. Look for profitable, stable sectors with CEOs who maintain high dividend rates.

**Growth investors:** Low or zero dividend corporations reinvest profits into expansion. Share price appreciation comes from rising tangible book value and earnings power.

**Speculation:** Share prices react to changing cash, bonds, rates, trading and sentiment every 15 minutes via the fundamental formula. Earnings and sector production still update on the hourly turn.

**Computer-run investors:** Computer-run politicians and companies trade on value. They buy where the price sits below their view of what a company is worth, and are more likely to sell shares priced far above it. Overall trading volume stays about the same.

**Influence:** Owning enough shares gives you a voice in CEO elections. A significant stake can swing a contested vote.

**Concentration risk:** Corporations with very low public floats (below 5%) fall back to fundamental pricing for trades, which can create a liquidity gap between the market quote and execution price.

## What you can do

- **Buy and sell** from the Shares tab on a corporation page, or the Trade shortcut in the exchange list. Review the quote before you confirm.
- **Place limit orders** with an optional expiry. Buy funds and sell shares are held until filled or cancelled.
- **As CEO,** set the dividend rate, issue shares, split or reverse split, and (see [Corporations](/wiki/corporations)) go public or privatise.
- **Vote** in a shareholder CEO election when the seat is vacant: votes are weighted by shares.
- **Build a stake** above 50% of voting power to control a company, 75% to squeeze out minorities.

### Common questions

- **Why did my price move?** Check cash, debt, earnings and rates. Rate changes shift the cost of capital for every company.
- **Why can't I sell everything at once?** Large sells are paced so the market is not crashed in one turn.
- **Why is my trade price different from the quote?** Companies with under 5% public float trade at the fundamental price.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): cash, plants, earnings and growth set tangible book, earnings power and the growth premium.
- [Corporate Bonds](/wiki/corporate-bonds): bond debt lowers book value, held bonds add to it, and a default hurts the price.
- [Central Banks](/wiki/central-banks): the prime rate is the base of the cost of capital.
- [Currency Exchange](/wiki/currency-exchange): dividends and foreign holdings convert at market rates.
- [Market System: A Player's Guide](/wiki/market-system-guide): owned capacity and earnings set the book value and earnings behind the price.
- [Market Safeguards](/wiki/market-safeguards): a trip changes how share prices are computed for every company
- [Index Funds](/wiki/index-funds): Index inclusion brings steady fund buying of a company's shares, and removal brings selling.
- [Corporate IMF Restructuring](/wiki/imf): a rescued company's share price is cut by 0.85 and its shares are diluted.

**Affects**

- [Corporations](/wiki/corporations): share counts decide CEO elections, takeovers and control of subsidiaries.
- [Index Funds](/wiki/index-funds): listed shares make up the funds that passive investors hold.
- [Private Banking](/wiki/private-banking): share prices mark the prop desk book of investment banks.
- [Market Safeguards](/wiki/market-safeguards): aggregate share prices and market value are what it measures
- [Corporate Mergers & Acquisitions](/wiki/corporate-mergers): The target's share price feeds the reference valuation of an offer.
- [Subsidiary Corporations](/wiki/subsidiary-corporations): Buying or selling shares can lift you above 50% control or drop you below it.

## Status

Every country with an exchange runs this market, including the United States (NYSE), United Kingdom (FTSE), Germany (DAX), Japan (Nikkei), Ireland (ISEQ), Brazil (B3), China (SSE) and Nigeria (NGX). In multiplayer worlds prices update every 15 minutes. Command economies have no private listed companies, so no exchange.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Stock Market design page](https://docs.lakesidegames.net/design/stock-market.html).
`;
