export const lineOfCreditContent = `# Line of Credit

A line of credit lets you borrow cash straight from a central bank, based on your income, your wealth and your credit score. It is revolving: draw when you need cash, repay when you can. Interest builds up every turn and a small payment is taken automatically. If you cannot make that payment, the line freezes and your income is redirected to the loan until it catches up. Use it to bridge a short gap without selling assets at a bad price, and keep enough cash on hand to avoid the freeze.

## How it works

Your **credit score** runs from 0 to 100 and sets your **spread**, the extra interest you pay over the prime rate. Your **limit** is the most you can owe at once.

\`\`\`wiki-chart
line-of-credit-rate-by-score
\`\`\`

| What | Value |
| --- | --- |
| Credit score | 0 to 100 |
| Your spread | +5.0 points over prime at score 0, down to -1.0 at score 100 |
| Central bank adjustment | +2.0 points on every line, phased in over 8 turns |
| Interest-only mode | +2.0 points, and 24 turns before you can switch again |
| Income cap on your limit | Your payment may be at most 70% of your average income per turn |
| Equity cap on your limit | 1x your net worth |
| Income measured over | The last 48 turns, after income tax |
| Automatic payment | 0.40625% of what you owe, every turn |
| Interest | Principal plus unpaid interest, times the annual rate, divided by 48, every turn |
| Whole currency pool | The system lends at most 70% of that currency's savings deposits and bank reserves |

Your annual rate is the prime rate plus your spread plus the central bank adjustment. The spread comes from your score:

\`\`\`
spread = 5 - (score / 100) x 6
\`\`\`

### What goes into the score

- **Income score.** Your average income per turn, times 48, run through a curve that climbs quickly then levels off. Income of 2,500,000 a year scores about 63, and 7,500,000 about 95. Income here means recurring pay: CEO salary, dividends, bond coupons and interest, after income tax.
- **Net worth score.** The same kind of curve on your wealth in ₳ (the game's internal reference currency, used to compare currencies). 4,000,000 scores about 63.
- **Blend.** Without a company: half income, half net worth. If you are a CEO with a company credit rating: 75% company rating and 25% income.
- **Leverage penalty.** The more of your assets are already borrowed, the lower your score, up to a 30 point hit.
- **High-rate penalty.** When the prime rate is above 2.5%, you lose 5 points for each point above it, up to 22 points. Wealth cushions this: a net worth score of 100 shields you from 65% of it.

\`\`\`wiki-chart
line-of-credit-score-curves
\`\`\`

\`\`\`wiki-chart
line-of-credit-prime-penalty
\`\`\`

### Paying and what a missed payment does

Each turn the interest is added to what you owe, then the automatic payment is taken: first from your cash in that currency, then from your savings, then from your other currencies converted at market rates. Campaign funds are never touched. A payment goes to unpaid interest first, then principal. The payment is 0.40625% of the total owed, equal to 1.625% a month, since a game month is 4 turns.

If the payment cannot be covered in full, your line **freezes** and no new draws are allowed. While it is frozen, your CEO salary, dividends and bond coupons are redirected to the loan before they reach your wallet: unpaid interest first, then principal. That income is converted into the loan's currency if needed. The freeze lifts when a turn's payment is met in full, or when your income for the turn covers the scheduled payment. A single missed payment can drain your income for a long time if you do not fix the cash shortage.

**Interest-only mode** pays only the interest each turn and leaves what you owe unchanged. It costs 2.0 extra points, applies to one currency at a time, and locks for 24 turns after you switch.

**Worked example.** A player has no company, earns 1,000,000 a year, and has 2,000,000 of net worth. The prime rate is 3%.

1. Income score is 33 and net worth score is 39. Blend: 36.2.
2. The high-rate penalty is 0.5 x 5 = 2.5 points, cushioned by wealth to 1.9. Score: 34.3.
3. Spread is 5 - 0.343 x 6 = 2.94 points. Annual rate is 3 + 2.94 + 2.0 = 7.94%.
4. Income cap: a payment of at most 70% of 20,833 a turn allows about 3.59 million of debt. Equity cap: 2 million. The lower one wins, so the limit is 2,000,000 (assuming 1 unit of your currency equals 1 ₳).
5. You borrow 500,000. Each turn: interest 500,000 x 7.94% / 48 = 827.31. The automatic payment is 500,827.31 x 0.40625% = 2,034.61: 827.31 interest and 1,207.30 principal.
6. One turn you only have 1,000 in cash and nothing else to draw on. 1,000 is paid (827.31 interest and 172.69 principal), you are 1,034.61 short, and the line freezes. Your next salary is redirected to the loan, up to what you owe.

## What you can do

- **Open a line.** Central Bank page for the currency you want to borrow, then the Line of credit tab, then Open account. Each currency has its own line, and you can borrow another country's currency.
- **Borrow.** Enter an amount under Borrow to wallet. The cash lands in your wallet and the loan is recorded as new money.
- **Repay.** Enter any amount under Repay at any time, to clear debt early or to unfreeze.
- **Switch to interest-only.** Use the payment mode picker. Mind the 24-turn lock.
- **Read your limit.** The tab shows both caps and your limit is the lower one. With no income history yet, only the equity cap applies, and it grows as income builds up over 48 turns.

Why is my rate higher than prime? You pay your spread and the central bank adjustment on top of it. Why was my income taken? Your line is frozen. How do I unfreeze it? Repay, or let a full payment go through, or earn enough in a turn to cover it.

Tips: improve your score before you draw, since a higher score saves interest for the life of the loan. Keep cash for the automatic payment. Assets bought with borrowed money do not raise your limit, since the equity cap counts net worth after debt.

## Connections

**Driven by**

- [Central Banks](/wiki/central-banks): the prime rate is the base of your rate and the high-rate penalty.
- [Savings & Interest](/wiki/savings-interest): the savings pool, plus bank reserves, caps the whole currency's lending.
- [Corporations](/wiki/corporations): a CEO's company rating, salary and dividends feed the score and limit.
- [Corporate Bonds](/wiki/corporate-bonds) and [Sovereign Bonds](/wiki/sovereign-bonds): coupon income counts toward the income you can borrow against.
- [Private Banking](/wiki/private-banking): Private loans sit beside central bank credit lines for characters.

**Affects**

- [Central Banks](/wiki/central-banks): draws create money and repayments retire it, and interest goes to bank reserves.
- [Savings & Interest](/wiki/savings-interest): the automatic payment withdraws from your savings when cash is short.
- [Corporations](/wiki/corporations): a frozen line redirects CEO salary and dividends.
- [Corporate Bonds](/wiki/corporate-bonds) and [Sovereign Bonds](/wiki/sovereign-bonds): a frozen line redirects coupon income.

## Status

Live in standard worlds, for each country whose currency is tradable (18 currencies, with the euro from 1999). Countries without a tradable currency, such as the planned economies, have no line of credit. If a central bank page has no Line of credit tab, that world or currency does not offer it.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Every constant, the exact order of payment and the garnishment rules are on the [monetary system design page](https://docs.lakesidegames.net/design/monetary-system-as-shipped.html).
`;
