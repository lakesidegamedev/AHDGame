export const interbankLendingContent = `# Interbank Lending

If you run a chartered bank (see [Private Banking](/wiki/private-banking)), you have two ways to move cash outside the deposit market. You can **lend spare cash to another bank**, or, if your bank trades for its own account, you can **borrow from the central bank** against that trading book. Both exist so a trading bank always has a source of short-term cash, and so a bank with idle reserves can earn on them.

## How it works

| What | Value |
| --- | --- |
| Who can lend to another bank | Retail or universal banks |
| Who can borrow from another bank | Investment or universal banks |
| Currency | Lender and borrower must share a charter currency |
| Most you can have lent out | 50% of your lendable headroom, counting every interbank loan you already have |
| Interest rate | You choose it, at least 0% |
| Interest | Principal x rate / 48 per turn, interest only |
| Write-off | After 8 turns in a row of missed interest |
| Central bank margin line rate | Prime rate plus 1.5 points |
| Margin line limit | 50% of your trading book's market value, counting unpaid interest |

\`\`\`wiki-chart
interbank-arrears-write-off
\`\`\`

![Liquidity map: a lender bank lends to a borrower bank, the borrower can also draw a central bank margin line, and missed interest leads to a write-off.](/wiki-images/diagrams/interbank-lending-liquidity-map.svg)

**Lendable headroom** is your deposits less what you must hold in reserve, less your loans: deposits x (1 - reserve requirement) - loans. You also need the cash itself in your reserves.

**Lending.** You set the amount and the rate. Cash moves from your reserves to the borrower's, and a loan record tracks principal, balance and rate. It is separate from your ordinary loan book and does not count in your loan total. The borrower pays interest every turn. They can repay any amount up to the balance whenever they like, and the loan is **interest only**: principal comes back only when the borrower repays it, and the lender cannot call it in.

**Missed interest.** If the borrower cannot cover a turn's interest, they pay what they can and the turn counts against the loan. Eight misses in a row and the loan is written off: you lose the remaining principal and the borrower's recorded interbank debt drops by the same amount. A full payment in between resets the count. Chasing a defaulted borrower is not modelled.

**Margin line.** An investment or universal bank can draw from the central bank against its own trading book. The rate is prime plus 1.5 points. Your total margin debt, including any unpaid interest, cannot exceed half the market value of the book, so a bank that cannot service the line loses room instead of quietly borrowing its arrears. A draw **creates money**: cash appears in your reserves and the central bank records the new money. Repaying destroys it again.

**Worked interbank loan.** A retail bank has 20,000,000 of cash-backed deposits, a 10% reserve requirement and 8,000,000 of loans. Headroom is 20,000,000 x 0.9 - 8,000,000 = 10,000,000, so it may have at most 5,000,000 on the interbank market. It lends 3,000,000 at 4.8%: 3,000,000 x 0.048 / 48 = 3,000 of interest a turn. It can lend 2,000,000 more, not 5,000,000. If the borrower misses interest for 8 straight turns, the 3,000,000 is written off.

**Worked margin draw.** A trading bank's book is worth 20,000,000, so its limit is 10,000,000. Prime is 3%, so the line costs 4.5%. It draws 6,000,000 and pays 6,000,000 x 0.045 / 48 = 5,625 a turn. Room left: 4,000,000, less any unpaid interest.

**If a lender fails.** Its interbank loans are marked defaulted, the borrowers keep the cash, and the loss lands on the failed bank's estate. A late recovery goes to the deposit insurance fund once the failed bank's depositors have been made whole. You do not act on this directly.

**Why it exists.** Banks route cash to where it is needed without each one holding enough reserves for every shock. A retail bank with idle deposits earns a return, and a trading bank gets funding it cannot raise from deposits, since it takes none.

## What you can do

You must be the CEO of the bank. Open the bank's page for the corporation, then the **Interbank and central bank credit** panel.

- **Lend.** Pick a borrowing bank, enter an amount and a rate, and confirm. The panel previews your income per turn.
- **Choose a rate.** There is no market rate, so look at the prime rate and at how risky the borrower is. A higher rate earns more per turn but a borrower who cannot pay it will miss interest. Watch the loans table for borrowers falling behind, well before the 8th miss.
- **Draw and repay on the margin line.** Enter an amount within your collateral room. Repay any time with cash from your reserves.

Tips: keep some headroom unlent so withdrawals do not catch you short. Repay the margin line when your trading book falls in value, since the limit shrinks with it.

## Connections

**Driven by**

- [Central Banks](/wiki/central-banks): the prime rate sets the margin line's cost.
- [Private Banking](/wiki/private-banking): your charter type, deposits and reserve requirement set who can lend and how much.

**Affects**

- [Central Banks](/wiki/central-banks): margin draws create money and repayments retire it.
- [Private Banking](/wiki/private-banking): loans fund trading banks, and a failed lender's loans are written off.

## Status

Live in worlds where private banking is open and banks may run a trading book. If your world does not allow it, the Interbank panel does not appear.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Constants, ordering and failure paths are on the [interbank lending and bank resolution design page](https://docs.lakesidegames.net/design/interbank-and-bank-resolution.html).
`;
