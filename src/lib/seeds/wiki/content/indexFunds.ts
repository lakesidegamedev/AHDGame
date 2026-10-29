export const indexFundsContent = `# Index Funds

An index fund holds a fixed basket of shares and bonds so you do not have to pick them yourself. You buy **units** in the fund, its price per unit moves with the basket, and part of the dividends the basket earns is paid out to you. A fund that holds a big slice of a corporation also holds real votes in it, so funds matter for corporate control as well as for investing.

## How it works

1. **Price.** A fund's price per unit is its **net asset value (NAV)**: everything the fund owns (cash, shares, bonds and cash set aside for open buy orders) divided by the units outstanding. A brand new fund starts at 100 per unit. NAV updates once per turn, so there is no price to chase between turns.
2. **Subscribing.** Your cash is turned into units at the current NAV. **Redeeming** (withdrawing) turns units back into cash at the current NAV. There is no lock-up and no maturity date. If the fund is short of cash it sells holdings to pay you, and you keep your share of the fund until you are paid.
3. **No active management.** The fund follows its basket. It keeps at most 75% of its backing in shares and at least 25% in a reserve of bonds and cash.
4. **Dividends.** When the shares in the basket pay dividends, 75% stays in the fund and raises NAV. The other 25% is paid straight to unit holders as cash. You get steady income and compounding in one product.
5. **Tax.** Fund dividends count as taxable income, the same as dividends from shares you own directly (see [National Budget](/wiki/national-budget)). Fund units count toward your net worth at the quoted NAV, so moving cash into a fund changes what you hold, not what you are worth.

Most funds are run by the game: one broad fund per country, one per industry, and one global fund. A player's corporation can also run a **sponsored fund** that charges a fee (see below).

## Key numbers

| Item | Value |
| --- | --- |
| Starting NAV of a new fund | 100 per unit |
| Dividends kept in the fund | 75% |
| Dividends paid to unit holders | 25% |
| Maximum share of a fund in equities | 75% |
| Minimum share in bond and cash reserve | 25% |
| Free float needed to be listed | at least 15% of shares in public hands |
| Size needed to be listed | at least 5% of the median candidate's market value |
| Failed checks before a listed corporation is dropped | 3 in a row |
| Votes needed to direct a fund | 50% of its units |
| Sponsored fund charter fee | ₳2,500,000 (not refunded) |
| Sponsored fund seed capital | at least ₳10,000,000 |
| Sponsored fund yearly fee | 0.10% to 2.00% of assets |
| Sponsor fee stops below this backing level | 90% |
| Listing petition: turns to a decision | 12 |
| Listing petition: waiver length | 48 turns |
| Wind-up grace before forced selling | 24 turns |

The ₳ amounts are set in the game's base currency and shown to you in your local currency at the current exchange rate.

## Worked example

A fund holds ₳12,000,000 of assets and has 120,000 units, so NAV is 100.

- You subscribe ₳5,000 and receive 50 units.
- The fund's shares pay ₳60,000 in dividends. ₳45,000 (75%) stays in the fund, so NAV rises to 12,045,000 / 120,000 = 100.375. Your 50 units are now worth ₳5,018.75.
- The other ₳15,000 (25%) goes to unit holders, which is 0.125 per unit. You receive 50 x 0.125 = ₳6.25 in cash, which is taxable income.
- If this were a sponsored fund with a 1.00% fee, the sponsor would take 12,000,000 x 1% / 48 = ₳2,500 from the fund each turn (48 turns make a game year). On your ₳5,000 that is a cost of about ₳50 a year.

\`\`\`wiki-chart
index-fund-reinvest-vs-direct
\`\`\`

## What you can do

- **Look at a fund.** Open the Stock Market for a country and choose a fund. Its page shows NAV, what it holds, its financials and, for sponsored funds, the fee.
- **Subscribe or withdraw.** Use the Subscribe and Withdraw buttons on the fund page. You need enough cash to subscribe, and enough units to withdraw.
- **Pick the right fund.** A country fund tracks that country's market, an industry fund tracks one industry, and the global fund spreads across everything. Compare the fee on sponsored funds first, because it comes out of your return every turn.
- **Steer a company.** Own at least half of a fund's units and you direct how its shares vote (see below).
- **Sponsor a fund or petition for a listing,** if you run a corporation (see below).

![Index fund page showing NAV per unit, assets under management, holders, backing ratio and the Buy fund units button](/wiki-images/screens/index-funds-fund-page.webp)

Tips: fund holders are paid dividends in cash, so a fund suits you if you want income as well as growth.

## How a fund votes its shares

A fund has no opinion of its own, so a rule decides where its votes go.

![Decision tree for how a fund votes: a holder with at least half the units directs it, otherwise it follows the majority cast by others, otherwise it abstains.](/wiki-images/diagrams/index-funds-fund-vote-rule.svg)

- **Directed.** A unit holder with at least half the fund's units controls it. The fund votes the way that holder instructs on each shareholder vote. You give the instruction on the vote itself and can change or withdraw it while the vote is open. Buying units is therefore a route to corporate influence, not only exposure.
- **Undirected.** With nobody in control, the fund votes with the majority actually cast by everyone else. A passive fund follows the owners rather than overruling them.
- **Abstaining.** With no controller and no majority to follow, including a tie, the fund sits the vote out and its shares are removed from the count. Without this, a company dominated by funds could end up unable to decide anything.

Control is checked when the vote resolves, not when you give the instruction. If you sell below half the units before the vote closes, your instruction lapses. It does not pass to whoever bought the units.

## Listing standards

Being in an index means a large, automatic buyer starts absorbing your shares, so it has to be earned. A corporation qualifies when it clears all three bars:

| Standard | Requirement |
| --- | --- |
| Free float | At least 15% of shares in public hands |
| Size | At least 5% of the median market value of the index's other candidates |
| Solvency | Not insolvent |

![Lifecycle of an index constituent: listed after clearing float, size and solvency, dropped after three misses in a row, or kept by a petition waiver from the index committee.](/wiki-images/diagrams/index-funds-listing-lifecycle.svg)

**Size is relative.** A fixed money amount would mean nothing in a modern world and would be impossible in 1953, when the whole economy is smaller. Measuring against the median candidate means the same thing in every era: not a rounding error next to your peers. It is measured against the corporations competing for that index, so a small country's fund judges you against that country's market.

**Dropping is slow.** A listed corporation must fail for three observations in a row before it is removed. Otherwise ordinary price noise around the bar would push the same company in and out, and holders would pay trading costs both ways. A corporation that recovers for one observation resets its count. A corporation that has never qualified is held to the bar at once. When the grace runs out, the fund sells the position and records which standard was missed.

**Missing data never excludes anyone.** A corporation with no recorded public float is treated as unknown, not as zero.

## The index committee

A corporation that misses the free float or size bar can petition its country's index committee to be admitted anyway. The committee is the same cabinet seat that rules on merger review (see [Corporate Mergers & Acquisitions](/wiki/corporate-mergers)), so the officeholder who decides whether two firms may merge also decides who belongs in the national index. A country whose era has no such seat has no committee and no waivers.

- **Solvency cannot be waived.** No one can wave an insolvent corporation into an index, because fund holders would pay for the favour.
- **Cost.** Petitioning is lobbying and costs corporate cash. The money is paid on filing and never returned, whatever the answer. If a player holds the seat, the money goes to them personally and the record is public. If the seat is vacant or held by a computer-run official, the money goes to the treasury.
- **Who decides.** A player in the seat rules directly. Otherwise a fixed rule decides after 12 turns. It grants the petition only if the contribution is at least 2% of the corporation's market value (never less than ₳250,000) and the shortfall is not too large: you must reach at least half of the float or size required.
- **A waiver is a licence.** It lasts 48 turns. A corporation that never fixes the underlying problem must ask again, in front of whoever holds the seat by then.

Example: a corporation worth ₳80,000,000 has a free float of 9% against the 15% bar, so it reaches 60% of what is required. A contribution of at least 2% x 80,000,000 = ₳1,600,000 can win a waiver by default. At a float of 6% it reaches only 40%, and no payment can win it automatically.

## Sponsored funds

A **sponsored fund** is one a player's corporation charters and runs as a business. Only a corporation with a financial sector can sponsor one.

- **Start-up cost.** A ₳2,500,000 charter fee, paid to the sponsor's national treasury and never refunded, plus at least ₳10,000,000 of seed capital paid into the fund.
- **Choices.** A name and ticker, a mandate and a fee. The mandate is a scope (one country, or global) and a kind (broad, or a single industry). The sponsor cannot hand-pick the holdings, because a fund whose sponsor picks the basket is not an index fund.
- **How the sponsor earns.** A yearly fee of 0.10% to 2.00% of assets, taken from fund cash a slice each turn and paid to the corporation as revenue. The sponsor holds no special stake in the fund's returns beyond its seed units, so the way to profit is to attract holders and keep them.
- **When the fee stops.** Automatically, if the fund's backing falls below 90%, or if the fund is winding up. The fee is never taken by forcing a sale. If the fund has no spare cash, the sponsor is not paid that turn.
- **Winding up.** The sponsor's CEO can close a fund, but not instantly. The fund stops buying and stops charging, then sells its holdings, bonds included, over the following turns. Once everything is cash, every unit holder is paid out at the final value, which is what the portfolio actually sold for rather than the last quoted NAV. Only then does the sponsor get back whatever remains of its seed capital. Seed capital is last in line, so a fund that lost money costs its sponsor before it costs holders.

\`\`\`wiki-chart
index-fund-expense-ratio-drag
\`\`\`

If you hold units in a fund that is winding up, you do not need to do anything: you are paid out automatically. You can also withdraw earlier at the quoted NAV.

## Connections

**Driven by**

- [Stock Market](/wiki/stock-market): share prices and dividends set the fund's NAV and income.
- [Corporate Bonds](/wiki/corporate-bonds): bond prices and defaults move the value of the fund's reserve.
- [Central Banks](/wiki/central-banks): policy rates move the price of the sovereign bonds in the reserve.
- [Corporate Mergers & Acquisitions](/wiki/corporate-mergers): the same cabinet seat that reviews mergers rules on index listing petitions.
- [Pensions](/wiki/pensions): pension schemes buy broad fund units, adding demand and a long-term holder.

**Affects**

- [Stock Market](/wiki/stock-market): index inclusion brings steady buying of a company's shares, and removal brings selling.
- [National Budget](/wiki/national-budget): fund dividends are taxable income for holders.
- [Corporations](/wiki/corporations): a fund's votes can decide shareholder votes, and a sponsor earns fee revenue.
- [Pensions](/wiki/pensions): the market value of fund units a scheme holds raises or lowers its funding ratio.

## Status

In a world where fund trading has not opened yet, you can browse funds but the Subscribe and Withdraw buttons are unavailable, and the fund page says so. Listing petitions only exist in countries and eras that have the merger review seat. Sponsoring needs a corporation with a financial sector.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules for the stock side of funds are on the [Stock Market design page](https://docs.lakesidegames.net/design/stock-market.html).

See also: [Glossary](/wiki/glossary)
`;
