export const savingsInterestContent = `# Savings & Interest

Idle cash in a savings account earns interest every turn. The yield is tied to your central bank's prime rate and to inflation, and the interest is added to your balance once a quarter. Savings is the safe, always-withdrawable place to park money, so it is worth knowing what it pays and when a bond or a bank deposit beats it.

## How it works

The savings yield (APY, the annual percentage yield) is **half the real rate**. The real rate is the prime rate minus local inflation, never less than 0.5 points:

\`\`\`wiki-chart
savings-apy-by-inflation
\`\`\`

\`\`\`wiki-chart
savings-balance-quarterly-credit
\`\`\`

\`\`\`
realRate = max(0.5, primeRate - inflation)
APY      = realRate / 2 + centralBankDepositBonus
\`\`\`

Using the real rate closes a carry trade, where money chases the highest nominal rate. A currency with a high prime rate usually has high inflation too, so its real rate lands near everyone else's and parking money there earns no free real return. The 0.5 point floor is the same in every currency, so it favours none of them, and it guarantees at least 0.25% APY (plus the bonus below).

| What | Value |
| --- | --- |
| Yield | Half of (prime rate minus inflation), with that difference floored at 0.5 points |
| Central bank deposit bonus | +0.25 points on central-bank-held savings, phased in over 8 turns |
| Accrual | Every turn: balance x APY / 48 |
| Credit to your balance | Every 12 turns (a game quarter) |
| Turns in a game year | 48 |
| Share cap | Interest accrues on at most 25% of the currency's whole savings pool per account |
| Prime rate at or below 0% | No interest |

Yields at a central bank with the full bonus:

| Prime rate | Inflation | Real rate | Savings APY |
| --- | --- | --- | --- |
| 4.0% | 0.0% | 4.0% | 2.25% |
| 4.0% | 2.0% | 2.0% | 1.25% |
| 8.0% | 6.0% | 2.0% | 1.25% |
| 14.0% | 13.8% | 0.5% (floor) | 0.50% |

**Worked example.** You hold 1,000,000 in savings. Prime is 4.0% and inflation is 2.0%, so the real rate is 2.0%, half is 1.0%, and the bonus makes 1.25%. Each turn you accrue 1,000,000 x 0.0125 / 48 = 260.42. After 12 turns the pot is credited: 12 x 260.42 = 3,125.04. That credit joins your balance, so the next quarter earns on 1,003,125.04. Interest compounds quarterly.

**The share cap.** If the whole currency has 10,000,000 in savings and you hold 4,000,000, only 2,500,000 (25%) earns interest. The cap stops one huge account from farming almost the entire pool. Ordinary balances under a quarter of the pool never notice it. The pool total used is last turn's.

Amounts round to whole units for yen and to two decimals for other currencies.

Accrued interest that is not yet credited is tracked and shown as "Accrued (uncredited)". If you close or move an account mid-quarter, the pending amount is settled at that point.

## What you can do

- **Deposit and withdraw.** Open the Savings tab on your country's Central Bank page and move cash between your wallet and savings. You can withdraw at any time, with no lock-up.
- **Check the numbers.** The tab shows your balance, lifetime interest, accrued but uncredited interest, an estimate for this turn, and the total savings in the currency.
- **Compare with a bank.** A balance held at a private bank earns that bank's own rate, which the savings screen quotes. Player savings at a private bank are a label on your account, not cash the bank holds, so the bank failing does not take your principal. See [Private Banking](/wiki/private-banking).
- **Compare with bonds.** Sovereign bond coupons are the prime rate plus a term premium, so a bond usually pays more than savings, but its price moves and it cannot be withdrawn at par on demand. See [Sovereign Bonds](/wiki/sovereign-bonds).

Why is my interest so low? Almost always because inflation is close to the prime rate, which leaves the floor of 0.25% plus the bonus. A central bank chair who raises rates faster than inflation lifts your yield.

Interest counts as taxable personal income when it is credited.

Tips: keep an eye on the real rate, not the headline prime rate. Do not park an outsized share of a small currency's pool in one account, because the cap makes the excess earn nothing.

## Connections

**Driven by**

- [Central Banks](/wiki/central-banks): the prime rate and its deposit bonus set the yield.
- [National Metrics](/wiki/national-metrics): local inflation is subtracted from the prime rate.
- [Private Banking](/wiki/private-banking): a bank can hold your balance and pay its own rate.
- [Line of Credit](/wiki/line-of-credit): the automatic loan payment withdraws from savings when your cash is short.

**Affects**

- [Line of Credit](/wiki/line-of-credit): savings deposits and bank reserves fund lines of credit, and the system lends at most 70% of them.
- [Central Banks](/wiki/central-banks): central bank savings interest creates new money.
- [Currency Exchange](/wiki/currency-exchange): the real rate on savings stops currencies from paying a free carry.
- [National Metrics](/wiki/national-metrics): savings flow dampens or stimulates inflation.

## Status

Live in every world, for each country whose currency is tradable: 18 currencies in all, with the euro only from 1999. Countries whose currency is not tradable, such as the planned economies, have no savings tab.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The constants and the exact accrual order are on the [monetary system design page](https://docs.lakesidegames.net/design/monetary-system-as-shipped.html).
`;
