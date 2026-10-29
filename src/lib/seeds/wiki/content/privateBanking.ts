export const privateBankingContent = `# Private Banking

You own a financial sector and it earns a steady margin. A **private bank** is the second way to earn from it: the sector's licensed banking arm, which takes deposits, lends against a reserve requirement, sets its rates inside a corridor set by the central bank, and can fail if depositors lose confidence. It also gives other players a place to borrow and save beyond the central bank.

A corporation that owns a financial sector can charter one bank. The bank attracts household deposits by offering a better rate than the central bank's savings rate, lends part of those deposits to named borrowers and a bulk NPC loan book, and must keep a share of deposits in reserve. A run on the bank, a capital shortfall or too many bad loans can end it. Insurance and the central bank stand behind depositors.

![A bank balance sheet with reserves, loans, deposits and capital, the run line, and the discount window, insurance fund and Treasury behind it.](/wiki-images/diagrams/private-banking-balance-sheet.svg)

| Rule | Value |
| --- | --- |
| Charters per corporation | 1, posting about 5 times the corporation founding cost (a third of that for investment charters) |
| Branch share of financial capacity | 10% to 90%, default 50% |
| Deposit ceiling | The smaller of branch capacity and 12 times book equity |
| Reserve requirement | Set by the central bank (modern default 10%, historical default 20%, range 5% to 95%) |
| Named loan principal | Capped by bank cash, deposit headroom, and 35% of demonstrated per-turn income |
| Bank run line | 0.5 times required reserves |
| Confidence bands | Green from 0.7, amber from 0.4, red below |
| Minimum capital ratio | 8%, recapitalise within 12 turns or lose the charter |
| Stress ratio | 6% after a 15% loss on the book |
| Prop book cap | 3 times desk equity; any one forex currency at most 50% |
| Discount window | Prime + 3 points, up to 25% of the deposit base |
| Charter type switch lock | 24 turns |

## Getting a charter

A [corporation](/wiki/corporations) that owns at least one financial sector may issue exactly one bank charter, and its cash charters and capitalises the bank. Chartering posts minimum capital from the corporation treasury (scaled by era and currency) and is automatic once the objective gates pass: financial sector ownership, legal charter type, matching treasury currency, and enough cash.

| Type | Deposits | Lending book | Prop trading |
| --- | --- | --- | --- |
| Retail | Yes | Yes | No |
| Investment | No | No | Yes |
| Universal | Yes | Yes | Yes |

Most nations start with a **banking separation** law that allows retail or investment, but not universal. To switch the country to universal charters, propose an economy bill on the **Banking Separation Act** law type and choose the **Universal Banking Charter Act** option. There is no standalone universal-charter bill: the switch lives inside the separation law. Command economies do not offer private bank charters.

You can also change charter type yourself from the bank console, without re-chartering or posting capital twice. Moving to a charter that cannot take deposits returns the whole deposit book, and any switch locks the type for 24 turns.

The central bank chair can revoke a charter. A revoke is not a delete: it runs the same wind-up every other ending runs. Household deposits go back into circulation out of the bank's own cash, player savings pointers return to the central bank with their balances untouched, and only what is genuinely left over, capped at book equity, is paid up to the owner.

A chartered financial sector's capacity does one job or the other, which is why chartering does not dominate every other use of the sector. The CEO sets the branch share between 10% and 90% (default 50%):

- **Branch share** runs the deposit network and sets the deposit ceiling.
- **Commodity share** produces financial services for the commodity market.

Without this split, the same capacity would earn twice.

## Rates and the corridor

Retail and universal banks set **deposit** and **lending** offsets against the central bank prime rate. Offsets must sit inside the Regulation Q style corridor for that country and era. Historical worlds often cap deposit rates below prime and floor lending rates above it. Investment charters do not set deposit or lending offsets.

Effective rates are floored at small positive minima so a zero or negative quote cannot clear the market for free. The country's [central bank](/wiki/central-banks) page is the public source for prime rate, reserve policy, insurance, and the rate corridor that private banks must obey. Open **World > Banking** to choose a currency and compare chartered banks; bank owners manage the charter from their corporation page.

![The Federal Reserve page showing the prime rate, rate corridor, credit spreads, reserves, and insurance navigation](/static/wiki/player-guides/central-bank.png)

## Taking deposits

Banks attract NPC household deposits from the central bank's external broad money pool, competing on deposit rate versus the central bank savings APY (private banks compete with the central bank savings rate; see [Savings & Interest](/wiki/savings-interest)). Players can move their savings pointer to a private bank (one holder per currency). Moving savings to a private bank earns its rate but carries the bank's counterparty risk, not a loss of principal.

The two kinds of deposit are not the same thing, and this distinction drives almost every number in the console:

- **Household (NPC) deposits are cash.** Taking them moves real money out of the central bank's pool and into your vault. They are a liability you owe, they sit in your reserve requirement, and returning them moves cash back.
- **Player savings are a pointer.** The balance never leaves the player's account; only the label saying who holds it changes. No cash arrived, so player savings are not in your reserve requirement, not in your equity, and not something your bank can lose.

The deposit ceiling is the smaller of the branch capacity ceiling and 12 times book equity. The branch half is financial-sector capacity allocated to branches. The equity half is the leverage limit: a bank may anchor at most twelve times its book equity in household deposits, so a bank with no capital cannot anchor a deposit base it does not stand behind. The console names which half is binding. If equity binds, building more branches will not move the ceiling; posting capital will.

NPC inflow stops at the ceiling; outflow is always allowed. Player balances already above the ceiling are grandfathered, but the bank cannot accept new player deposits that would push further over.

A retail bank holds ₳50,000,000 of household deposits. The reserve ratio is 10%, so required reserves are ₳5,000,000 and the run line is 0.5 x 5,000,000 = **₳2,500,000**. Its book equity is ₳4,000,000, so the equity half of the deposit ceiling is 12 x 4,000,000 = **₳48,000,000**. It already holds ₳50,000,000, so it cannot take new inflows until it posts more capital, however many branches it builds.

\`\`\`wiki-chart
bank-deposit-ceiling-vs-equity
\`\`\`

Each currency has a deposit insurance fund with an insured cap (era and FX anchored). Chartered banks pay a per turn premium on insured deposits, risk weighted by how thin their reserves are versus the required ratio. Premiums fund the national insurance pool. The fund stands behind the household book: if a failed bank cannot return the household deposits it holds, the fund covers the gap and the Treasury covers what the fund cannot, landing in the federal budget. Player savings are not haircut on a failure, because the bank never held that cash. So a player who banks with a bank that fails loses the yield and the counterparty, not the principal.

## Lending

Deposit taking banks lend:

- An **NPC bulk book** sized off regional GDP and the lending rate (higher rates mean less volume and a worse credit mix).
- Named **player** loans to characters and corporations. Character loans credit **personal cash** in the loan currency immediately (not savings). Corporation loans credit that company's **liquid capital**. Proceeds never appear in the banking hub savings list; open loans are listed under Your accounts, with the destination named. Private loans sit beside central bank credit lines for characters (see [Line of Credit](/wiki/line-of-credit)).

Principal is the lowest of three numbers, shown on the form: the lending bank's **cash reserves** (the ring-fenced bank vault, not the holding company's liquid capital), leftover **deposit headroom** after the reserve requirement, and **35% of demonstrated per-turn income** after existing private-bank payments. That cap is not bond issuance headroom. A corporation with a large bond programme can still be refused a private-bank loan if the bank's vault or the borrower's income cannot support it.

Reserve requirements set by the central bank limit how much of the deposit base can be lent. Banks may blacklist corporations, characters, and every constituent of a named index fund. Charter type, deposits and the reserve requirement also set who can lend on the [interbank market](/wiki/interbank-lending) and how much.

## Runs

Each solvency pass scores the bank on reserves, capital, and loan losses. The score maps to a published warning band:

| Band | Meaning |
| --- | --- |
| Green | Healthy |
| Amber | Stress; players see the warning one turn before NPC flight intensifies |
| Red | Failure path |

NPC deposits flee in proportion to low confidence. A failed bank can raise panic at peer banks in the same currency.

Failure needs two things at once: a red band, and cash below the **run line**, which is 0.5 times required reserves, and required reserves are household deposits times the reserve ratio. The console shows both numbers and your distance to the line. A red band with cash above the line does not fail the bank; cash under the line with a green or amber band does not either. That is one turn of notice, on purpose.

In the example above, if the bank's confidence band turns red and cash falls below ₳2,500,000, it fails. If it is red with ₳3,000,000 in cash, it survives that turn, but that is one turn of notice. Borrowing from the discount window would add cash but lower its confidence.

## Supervision: capital before the run

The warning badge and the run mechanic are the **market** disciplining a bank after the fact. Supervision is the regulator disciplining it before. Your bank's **capital ratio** is its capital (posted capital plus the corporation's own free cash) divided by its risk assets, meaning the loan book plus any proprietary book.

| Test | Requirement | What failing costs you |
| --- | --- | --- |
| Minimum | 8% capital ratio | Recapitalize within 12 turns or the charter is revoked |
| Stress scenario | 6% after a 15% loss on the book | No distributions and no new proprietary positions until fixed |

**The stress scenario is published and fixed.** The supervisor assumes 15% of the book defaults at once, absorbed by capital. There is no dice roll: you can compute your own result before the regulator does, which makes the requirement something to plan against rather than a periodic surprise.

**Two thresholds, not one.** A single line would make supervision binary: fine one turn, dead the next. Failing the *stress* test does not endanger your bank and does not touch your charter; what you lose is the right to pay yourself. A bank that cannot survive a downturn on paper does not get to distribute in the meantime. Falling below the *minimum* is the serious one, and it starts a clock.

**Recapitalizing** moves cash from the corporation into the bank's posted capital. It is the same balance sheet, but a different claim: posted capital absorbs losses before depositors do, and cannot be spent on anything else. The interface tells you the exact amount that cures the breach.

**Missing the deadline revokes the charter: it does not fail the bank.** Those are different outcomes and the difference matters to your depositors. A failure means the bank ran out of money to pay them, and they take a haircut above the insured cap. A revocation means the regulator pulled the licence of a bank that would not recapitalize; the book is unwound in an orderly way and posted capital is returned. Depositors should not be punished because an owner ignored a deadline.

A bank that cures a breach and later breaches again gets a fresh 12 turns. The clock tracks the current breach, not your history.

## The discount window

When a bank cannot fund itself, the central bank will lend to it. That is what a lender of last resort is for, and until now no such facility existed: a deposit-taking bank facing a run could sell assets into a falling market, or it could fail.

The window is open to **retail and universal** charters only. An investment bank has no depositors to protect; its facility is the collateralized margin line.

| | |
| --- | --- |
| Rate | Prime + 3 percentage points |
| Limit | 25% of the deposit base |
| Cost beyond the rate | A confidence penalty while the debt is outstanding |

**The stigma is the mechanic.** A cheap facility with no consequence is free money, and every bank would sit on it permanently. Borrowing from the lender of last resort is a signal: the market reads it as a bank nobody else would lend to. So drawing lowers your confidence score, which feeds the same run mechanic the window is helping you survive.

That is the real trade-off. The window funds you through a run and makes the run marginally more likely. It is a decision, not an obvious yes, and a bridge to use only for a liquidity shortfall.

The penalty scales with how much of your **limit** you have used, not the raw amount: a small bank at its ceiling is in more trouble than a large one borrowing the same sum against a much bigger book. It decays as you repay, so a bank that uses the window briefly and clears it is not marked forever.

**The limit is deliberately low.** The window is a bridge across a liquidity shortfall, not a funding source. A bank that needs more than a quarter of its deposit base is not illiquid, it is insolvent, and resolution is the right answer rather than a bigger loan.

Interest is serviced each banking turn on the same terms as the margin line: paid to the central bank, and any shortfall accrues as arrears against your headroom, so a bank that cannot service the facility loses access rather than borrowing its unpaid interest indefinitely.

Drawing creates money at the central bank; repaying destroys it. Both legs are ledgered, so deposits, discount window draws and insurance all move money at the central bank.

## Prop trading

Investment and universal charters run a proprietary book in equities, bonds, index units, and forex. Positions are marked each solvency turn: equity prices from the [Stock Market](/wiki/stock-market) mark the equities, and forex rates from [Currency Exchange](/wiki/currency-exchange) mark the currency positions. Funding comes from:

- The **interbank** market: retail banks may lend part of their non reserved deposits to investment banks at a negotiated rate. A failed lender's loans are written off.
- A **central bank margin** line against posted collateral at prime plus a spread.

The prop book is capped at three times the desk's equity, and any single forex
currency may be at most 50% of prop-desk equity. It is not measured as half of
the forex sub-book. Borrowed money is never capital: drawing on the margin line
or the discount window raises cash and debt together and leaves the capital
ratio unchanged.

Forced liquidation feeds the confidence score.

Applies in worlds with private banking enabled, which includes current modern worlds. Historical worlds apply deposit and lending rate caps and often allow only retail or investment charters, not universal. Command economies do not offer private bank charters. Last checked 2026-10-29, version 1.18.0. This system has no separate design page yet.
`;
