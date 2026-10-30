export const imfContent = `# Corporate IMF Restructuring

If your shares suddenly trade 15% lower, your bonds vanish from the market and the CEO's pay reads zero, the IMF has rescued the company. Corporate IMF restructuring is an emergency rescue for a corporation that cannot pay its bonds: the bonds are swapped for a loan from the IMF, the IMF becomes a large shareholder, and dividends and CEO pay stop until the loan is repaid. No player can start it: the game team applies it to a distressed corporation in exceptional cases. It is meant for a company that has defaulted on its bonds, but the only hard requirement is outstanding bond principal (see [Corporate Bonds](/wiki/corporate-bonds)).

It is separate from the [IMF Sovereign Facility](/wiki/imf-sovereign-facility), which rescues a whole country's budget after a [sovereign default](/wiki/sovereign-default).

## The day of the rescue

A rescue changes the corporation in one step:

1. **Bonds are replaced.** The corporation's existing [corporate bonds](/wiki/corporate-bonds) are deleted, along with their price history. A share of their face value, chosen for each rescue, becomes the principal of an IMF loan owed to the IMF. Player bondholders get a system message telling them their position was reduced.
2. **The IMF becomes an owner.** New shares are issued to the IMF until it owns the chosen target share of the company. Everyone else is diluted.
3. **Payouts stop.** The dividend is set to zero and the CEO salary is set to zero.
4. **The share price is cut.** While the rescue is active the share price carries a 0.85 multiplier, a 15% discount, and the shares are diluted (see the [Stock Market](/wiki/stock-market)).

![Steps of a corporate IMF rescue: bonds replaced by a loan, IMF shares issued, payouts stopped, share price cut, then a capped payment each turn.](/wiki-images/diagrams/imf-rescue-activation.svg)

Why these rules? The IMF takes equity and halts payouts so that the money the company earns goes to repaying the rescue first, not to owners or executives who were in charge when it failed. The 0.85 multiplier keeps the share price from pretending the stigma does not exist.

| Key number | Value |
| --- | --- |
| Default income capture | 35% of per-turn income |
| Hard cap on capture | 45% of per-turn income |
| Share price multiplier | 0.85 |
| Dividend and CEO pay | 0 while active |
| New corporate bonds | not allowed while active |

## Paying the IMF back

Each turn after that the corporation pays the IMF. The payment is the smaller of the scheduled loan payment and a fixed share of the corporation's income for the turn, so the company's income (see [Corporations](/wiki/corporations)) sets how much of each payment can be collected. If that share does not cover the interest, the unpaid interest is added to the loan, so the loan grows and the schedule stretches.

Picture a corporation with 100 million of bonds outstanding. The rescue keeps 60% of face value, so the IMF loan starts at **60 million** at 6% over 240 turns (these terms are set per rescue, so they are illustrative). The company has 10 million shares and the IMF target is 40%.

- **Shares.** The IMF needs 40% of the new total. New shares = 0.4 times 10 million divided by 0.6, which is about 6.67 million. There are now 16.67 million shares. A holder of 1,000 shares goes from 0.010% to 0.006% of the company.
- **Payments.** Interest in the first turn is 60 million times 0.125%, which is 75,000. The scheduled payment is about 289,500. If income is 1 million per turn, 35% is 350,000, so the full 289,500 is paid. If income falls to 500,000, the cap is 175,000, which still covers interest but not the full schedule, so the loan shrinks more slowly. If income falls to 150,000, the cap is 52,500, less than the 75,000 of interest, and 22,500 is added to the loan that turn.

## Where you stand

- **CEO.** This is why your salary reads zero. You cannot set a salary above zero or declare a dividend while the rescue lasts, and a shareholder vote to pay you is ignored. Your best move is to raise income so the payment is covered. The ordinary bond-default refinance option is also unavailable.
- **Shareholder.** Your stake is diluted and the price is lower, so the question is whether to hold for the recovery or sell.
- **Bondholder.** Your bonds are deleted and you get a notice. The notice says holders keep part of face value, but nothing is paid to you: the retained amount becomes the IMF's loan, and every repayment goes to the IMF. The company cannot issue new bonds while the rescue is active. Check the corporation's page and your mail.
- **Everyone else.** The IMF holds the rescued company as a portfolio position, and the loan is recorded as a receivable on the IMF side.

## How it ends

The restrictions end when the loan is fully repaid. When that happens the rescue flag clears, dividends and CEO pay can resume, and the share price multiplier is removed. The program can also be ended early by the game team. Ending it does not sell the IMF's shares. The IMF stays a shareholder, and any further rescue would need a new decision. So it is not permanent, but the dilution is.

An IMF-managed corporation is also not dissolved by the automatic default resolution.

| | Corporate restructuring | Sovereign facility |
| --- | --- | --- |
| Borrower | One corporation | A country's national budget |
| Entry | Applied by the game team | Executive proposal approved by the legislature |
| Default capture | 35% | 20% |
| Capture cap | 45% | 30% |
| Equity dilution | IMF receives new shares | None |
| Share price effect | 0.85 on the rescued corporation | None |

Live in every world and era. It cannot be applied to the IMF itself, to a National Corporation or to a company with no bonds outstanding. It is applied rarely and only by the game team, so there is no player screen to start one. Last checked 2026-10-29, version 1.18.0. Exact rules: [Corporate IMF Bailout (design)](https://docs.lakesidegames.net/design/imf-corporate-bailout.html). See also: [Glossary](/wiki/glossary), [Sovereign Default](/wiki/sovereign-default)
`;
