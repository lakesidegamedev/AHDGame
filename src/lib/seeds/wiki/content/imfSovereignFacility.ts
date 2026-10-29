export const imfSovereignFacilityContent = `# IMF Sovereign Facility

A country that cannot sell its bonds can ask the IMF to pay them. The IMF sovereign facility is the bailout route out of a [sovereign default crisis](/wiki/sovereign-default): the IMF lends enough to cover the bonds coming due and the deficit, and the country pays it back out of a slice of its yearly revenue. There is no flat GDP penalty and no bond market lockout, but the country carries the loan for up to 240 turns and companies take a temporary margin penalty.

It is the country-level cousin of the [corporate IMF restructuring](/wiki/imf). Same lender and same style of loan, but the borrower is the national budget, not one company.

## From crisis to loan

1. **The crisis.** Three failed bond auctions in a row put the country in crisis. The head of government has 12 turns to pick a resolution, and the legislature must approve it. The crisis and the executive's choice create the loan.
2. **The loan is sized.** The loan equals the face value of bonds maturing within the next 12 turns (see [Sovereign Bonds](/wiki/sovereign-bonds)), plus the projected yearly deficit. If the country runs a surplus, only the bonds count.
3. **Repayment each turn.** The country owes a fixed payment each turn, like a mortgage. It is capped at a share of that turn's revenue (the **income capture**). Whichever is smaller is paid.
4. **Capitalization.** If the capped payment does not even cover the interest, the unpaid interest is added to the loan (this is called **capitalizing** it). The loan grows, and the repayment clock does not advance that turn.
5. **The end.** When the balance reaches zero the facility closes.

Why a cap? A country in crisis is short of money. Letting the IMF take a fixed share of revenue keeps the country running, at the price of a longer loan.

![Flow of the sovereign IMF facility: crisis, bailout, loan sizing, board window, capped payments with unpaid interest capitalizing, and closure at zero, with a separate recovery clock.](/wiki-images/diagrams/imf-sovereign-facility-loan-flow.svg)

| Key number | Value |
| --- | --- |
| Interest rate | 6% per year, fixed (0.125% per turn) |
| Term | 240 turns (5 years) |
| Income capture | 20% of revenue per turn by default, 10% to 30% allowed |
| Board window | 12 turns after the bailout |
| Board rate change | up to 2 points either way |
| Board capture change | up to 10 points either way |
| Board statement trust effect | 0.02 |
| Direct GDP penalty | none |
| Company margin penalty | -4.5 points, 48 turns at full strength, 24 turns fading |
| Bond market lockout | none |
| Recovery | at least 48 turns plus 5 disciplined turns |

There are 48 turns in a game year.

## Can the country afford the payments?

Revenue sets the payment cap and the deficit sets the loan size (see [National Budget](/wiki/national-budget)). While a bailout is active it caps the budget's interest rate and cuts spending to match revenue.

Take a country with 80 billion of bonds maturing within 12 turns and a yearly deficit of 20 billion. The loan is **100 billion**. Interest is 125 million per turn (100 billion times 0.125%). The level payment over 240 turns is about 482.5 million per turn, and over the whole term the country pays back about 115.8 billion.

\`\`\`wiki-chart
imf-facility-capitalization
\`\`\`

**A big economy.** Yearly revenue is 400 billion, so 8.33 billion per turn. At 20% capture the cap is 1.67 billion. That is far above the 482.5 million payment, so the cap never bites and the loan runs off on schedule.

**A small economy.** Yearly revenue is only 20 billion, so 417 million per turn. At 20% capture the cap is 83.3 million, less than the 125 million of interest. Each turn 41.7 million of interest is added to the loan, so it starts at 100 billion and grows. An IMF board member who raises capture by 10 points to 30% lifts the cap to 125 million, exactly the interest. The loan then stops growing but does not shrink. This country needs more revenue.

So the head of government should choose Bailout when revenue is healthy enough that the capped payment covers the 6% interest: you avoid the market lockout and the bond write-downs. Choose another path if revenue is thin, because a capped payment that falls short of interest makes the loan grow. See [Sovereign Default](/wiki/sovereign-default) for the other three; choosing the bailout sets the recovery clock and avoids the lockout. Legislators vote on the proposal, and a rejection or a tie turns into Repudiate, the harshest outcome. Bondholders see their bonds neither marked down nor put in default under a bailout, so it is the gentlest outcome for them.

## The IMF board

For **12 turns** after a bailout is granted, a member of the IMF board gets one action on that bailout:

- **Modify terms.** Change the interest rate by up to 2 points, or the capture share by up to 10 points, either way.
- **Endorse or criticize.** Post a public statement that moves other countries' trust in this one by 0.02, without changing the loan.
- **No action.** Let the window close.

Only one action is allowed per bailout, and the first board member to act wins. The board is the shareholders of the IMF corporation. That corporation is not listed on the exchange and starts with two shareholders, so ordinary players cannot buy in. If you want to know how a board member acts, you will be dealing with one of those two characters.

## Life after the bailout

A bailout puts the country into recovery. It ends after at least 48 turns and a streak of 5 fiscal-discipline turns, checked every 5 turns. Leaving recovery lowers the country's bond interest rate by 0.5 points for 100 turns. The loan itself can outlast recovery. It is a separate 240-turn schedule. Follow progress on the IMF overview screen (principal, rate, capture) and on the country page, which shows recovery progress and whether the facility is still active.

The executive who submits the bailout loses 10 favorability and gains 5 infamy, and the country sees one civil-unrest news event. Company owners in the country take the -4.5 point margin penalty at full strength for 48 turns, then fading over 24, scaled by sector (see [Corporations](/wiki/corporations)).

| | Sovereign facility | Corporate restructuring |
| --- | --- | --- |
| Borrower | A country's national budget | One corporation |
| Entry | Executive proposal, legislature approves | Applied to a distressed company by the game team |
| Interest rate | 6% fixed | Set per case |
| Default capture | 20%, range 10% to 30% | 35%, cap 45% |
| Equity dilution | None | IMF receives new shares |
| Oversight | 12-turn board window | None |

Available in every world and era where a country can enter a sovereign debt crisis, meaning any country with players enabled. Payments are credited to the IMF. They are not yet deducted from the country's own budget figures, so read revenue on the National Budget page with that in mind.

Last checked 2026-10-29, version 1.18.0. Exact rules: [IMF Sovereign Facility (design)](https://docs.lakesidegames.net/design/imf-sovereign-facility.html). See also: [Central Banks](/wiki/central-banks), [Glossary](/wiki/glossary)
`;
