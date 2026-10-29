export const nationalBudgetContent = `# National Budget

Every country keeps a national budget: what the government collects in tax, what it spends, and how much it owes. The budget moves every turn as corporations earn profits, players earn income and laws are passed. It also decides the country's credit rating, which changes what borrowing costs, how much trust the public has in the government, and how profitable every corporation in the country can be.

## How it works

### Money in: revenue

| Source | How it is set |
| --- | --- |
| Income tax | Three rates set by law: Low Income, Medium Income and High Income |
| Domestic corporate tax | Rate on profits of corporations headquartered in this country |
| Foreign corporate tax | Rate on profits of corporations headquartered elsewhere |
| Payroll tax | Rate set by law |
| Tariffs | Rate set by law, charged on imports |
| Sales tax | Rate set by law |
| Healthcare income | Earnings of national healthcare corporations (the NHS, for example) |
| Other | Earnings of other state-owned corporations |

Each source is a **tax base** (the amount of activity being taxed) multiplied by a rate. A US-headquartered corporation running a sector in Germany pays Germany's **foreign** corporate rate on those profits. A German-headquartered corporation in Germany pays the **domestic** rate.

Tax bases grow a little every turn with wages, trade and GDP: one 48th of the yearly growth rate per turn. A growing economy collects more tax without anyone touching a rate.

Income tax revenue weights the three groups by how many people are in each and how much they earn. A high earner counts as four times a low earner (relative earnings of 2 against 0.5). A change to the High Income rate therefore moves revenue more than its share of the population suggests.

### Money out: spending

- **Enacted laws.** Each law that passes with a budget cost adds a permanent yearly cost, grouped by category (healthcare, defence, education and so on). The budget panel lists every active law and how its cost is worked out (per person, share of GDP, or a fixed amount).
- **State grants.** Transfers from the national budget to state budgets.
- **Debt interest.** What the country pays on its sovereign bonds. This is already inside total spending, so it is not subtracted a second time.

### Surplus, deficit and debt

Surplus is revenue minus spending. A positive surplus strengthens the treasury. A negative one is a deficit. Each turn the treasury balance moves by one 48th of the yearly balance before debt interest, and then debt service is taken off.

When the country runs a deficit it borrows by issuing sovereign bonds every 12 turns, one quarter of the yearly deficit each time (see [Sovereign Bonds](/wiki/sovereign-bonds)). The size of the debt against the economy is what matters:

**Debt-to-GDP = total debt principal divided by GDP** (GDP smoothed over recent turns, so one noisy turn cannot change the rating).

### Credit rating

The debt-to-GDP ratio sets a rating from AAA to CCC. The rating sets the budget's borrowing rate and a yearly hit to public trust.

\`\`\`wiki-chart
credit-rating-borrowing-ladder
\`\`\`

| Debt-to-GDP | Rating | Borrowing rate | Public trust hit at fiscal close |
| --- | --- | --- | --- |
| up to 60% | AAA | 2.0% | 0 |
| up to 80% | AA | 2.5% | 0 |
| up to 100% | A | 3.5% | 0 |
| up to 120% | BBB | 5.0% | 0 |
| up to 150% | BB | 7.0% | -5 |
| up to 250% | B | 10.0% | -10 |
| above 250% | CCC | 14.0% | -15 |

The rating always reads the current ratio. A country's starting position in a scenario does not soften it. The borrowing rate applies to debt not yet covered by bonds. Bonds already issued keep the coupon they were sold with, and new bonds get a coupon from the central bank's prime rate (see [Central Banks](/wiki/central-banks)). Low investor confidence adds to the rate, and an active IMF program caps it.

### What debt and deficits do to corporations

Every corporation in a country feels the national finances through its profit margin, measured in percentage points.

\`\`\`wiki-chart
debt-to-gdp-corporate-margin-effect
\`\`\`

\`\`\`wiki-chart
deficit-corporate-margin-effect
\`\`\`

| Debt-to-GDP | Margin effect |
| --- | --- |
| Up to 50% | None |
| 50% to 100% | -0.5 points for every 10 points above 50% (-2.5 at 100%) |
| Above 100% | -2.5 plus -1 for every 10 points above 100%, never worse than -5 |

Deficits push the other way. A deficit adds +0.5 margin points per 1% of GDP, up to +5 at a 10% deficit. A surplus adds nothing. A deficit therefore stimulates the economy in the short run, while high debt drags on it. Subsidy laws add a further +7.5 margin points to the sectors they cover and show up as spending.

### Worked example

A country has GDP of 2,000 and debt of 2,200 (money units in its own currency).

- Debt-to-GDP is 110%, so the rating is BBB, the borrowing rate is 5.0% and there is no trust hit.
- The margin drag is -2.5 for the first 100%, plus -1 for the next 10 points: **-3.5 points**.
- Revenue is 800 and spending is 860, so the deficit is 60, or 3% of GDP. That adds **+1.5 points**.
- Net effect on every margin in the country: -2.0 points.
- Each quarter the treasury issues 60 / 4 = 15 of new bonds.

If debt keeps climbing to 3,000 (150%) the rating is still BB, but now each fiscal close costs 5 trust points and the margin drag has hit its -5 floor.

### The fiscal year

A game year is 48 turns. Fiscal year processing runs once a year, at turn 40 (October). It freezes revenue, spending, rates, debt and the list of active laws into a record used for year-on-year comparisons, applies the public trust hit for the current rating, and updates grants. Tax bases already grow every turn, so closing the year does not add a second jump.

### Debt ceiling

Each country has a statutory debt ceiling. At fiscal close, if debt has reached 95% of the ceiling or passed it, the legislature raises the ceiling to 110% of current debt and any debt ceiling crisis flag is cleared. The ceiling does **not** stop borrowing. A national bill that breaches it only triggers a warning. The real costs of high debt are the rating, trust hit and margin drag above, and they apply whether or not the ceiling is breached. East Germany's borrowing limit cannot fall below 40% of smoothed GDP.

### IMF bailout austerity

If a country is under an IMF sovereign bailout (see [IMF Sovereign Facility](/wiki/imf-sovereign-facility)), fiscal close scales every spending line, including grants and debt interest, down by the same factor until spending equals revenue. No deficit is allowed while the program runs.

### State budgets

Each state has its own budget. Its income comes from state income and sales tax, state corporate tax, property tax and grants from the national budget, and its balance is the running total of its surpluses and deficits.

In the US, formula grants (Medicaid, the Highway Trust Fund, education block grants and SNAP) are worked out and paid at fiscal close. In the UK, Japan and Germany, regional budgets are recalculated every turn from the regional economy and enacted laws. The UK Budget bundles tax rates and programme levels into one confidence vote in the Commons and writes to the same ledger as ordinary laws.

### Your own income tax

Characters pay income tax on what they personally earn: corporate salary, dividends (including index fund dividends), bond coupons, savings interest and bank deposit interest. Starting capital, transfers between characters, borrowing, campaign fundraising and repaid principal are not taxed.

- **Your tier.** Earnings over the last 12 turns are scaled up to a yearly figure and compared with the median income of your home state. Below 75% of the median you pay the Low Income rate. From 75% up to just under 200% you pay Medium Income. At 200% and above you pay High Income. With a state median of 40,000, Low is under 30,000, Medium is 30,000 to 79,999 and High is 80,000 or more. If you earned 6,000 in 12 turns, that scales to 24,000 a year, so you are in the Low tier.
- **Who gets the tax.** The national rate for your tier goes to the national treasury and your home state's rate for the same tier goes to the state budget. Together they can never be more than the income itself.
- **When it is charged.** Each turn you receive taxable income, from the money that income paid into.
- **If you cannot pay in full.** Available cash pays part of the bill. Only the remaining debt counts against your wealth, and later turns collect more.
- **Share sales.** Tax on realized profit is held back before the proceeds reach your wallet, and your cost basis comes back tax free. Short Term Holdings profit uses income tax rates. Long Term Holdings profit uses capital gains rates. If you buy 100 shares at 10 and sell at 15 with a 20% rate, the profit is 500, the tax is 100 and you receive 1,400 in cash. The sale screen shows gross proceeds, tax withheld and net cash, and warns about earlier unpaid tax that a later turn may collect.

Your portfolio tax statement shows tax assessed, amounts paid or withheld, remaining debt and the last collection turn.

## What you can do

- **Read the budget.** Open a country's Budget page to see revenue by source, spending by category, the credit rating and the list of enacted laws with their costs.
- **Legislators and heads of government** change the budget through [bills](/wiki/bills-legislation): tax rate bills, spending bills, subsidies and tariffs. Each enacted law stays in the ledger, so you can trace any surplus or deficit to the law behind it.
- **Pick the lever for the goal.**
  - Raise a surplus: raise income, corporate or tariff rates, or cut discretionary spending categories.
  - Stimulate with a deficit: cut tax rates or add spending, and let quarterly bonds cover the gap.
  - Bring the rating up: reduce the deficit and let GDP grow. Watch the 60%, 100% and 150% lines, where the costs jump.
- **Plan your own tax.** Check your tier before a big sale. A Long Term Holdings sale uses capital gains rates, a Short Term one uses income rates.

**Common questions.** *Why did my sale pay less than expected?* Tax on the profit was withheld before the cash arrived. *Why is my wealth lower after I earned income?* Any tax you could not pay yet counts as debt against your wealth. *Does the credit rating change anything for me?* It changes the trust the public has in the government, corporate margins in the country and what new bonds cost.

## Connections

![Budget loop: tax bases and spending set the balance, deficits drive bond issuance, debt to GDP and credit rating, which feed back into interest, public trust, margins, GDP and tax bases.](/wiki-images/diagrams/national-budget-fiscal-loop.svg)

**Driven by**

- [National Metrics](/wiki/national-metrics): GDP, wage and trade growth expand the tax bases every turn.
- [Bills & Legislation](/wiki/bills-legislation): enacted laws set tax rates and add permanent spending.
- [Corporations](/wiki/corporations): corporate profits and sales are the base for corporate and sales tax.
- [Tariffs](/wiki/tariffs): tariff rates and import value set tariff revenue.
- [Sovereign Bonds](/wiki/sovereign-bonds): each issue adds debt and interest to spending.
- [Central Banks](/wiki/central-banks): the prime rate sets the coupon on new bonds.
- [IMF Sovereign Facility](/wiki/imf-sovereign-facility): an active bailout caps interest and cuts spending to match revenue.
- [Index Funds](/wiki/index-funds): fund dividends are taxable income for holders, so they feed the income tax base.
- [Sovereign Default](/wiki/sovereign-default): a default writes debt down, cuts the credit rating and closes the bond market for a while.
- [Nationalization](/wiki/nationalization): the treasury pays compensation and receives remittance from absorbed companies.
- [National Corporations](/wiki/national-corporations): profit remits into the budget while losses and draws flow out.
- [Crisis Interaction](/wiki/crisis-interaction): funding options and weather disasters draw down the treasury
- [Cabinet Projects & Buildings](/wiki/cabinet-projects): Building upkeep above or below the envelope tilts the budget balance metric.

**Affects**

- [National Metrics](/wiki/national-metrics): deficits add inflation pressure.
- [Government Approval](/wiki/government-approval): higher rating bands cut public trust, and a deficit worse than 5% of GDP can trigger the Fiscal Crisis modifier.
- [Corporations](/wiki/corporations): debt drags margins, deficits and subsidies lift them.
- [Sovereign Bonds](/wiki/sovereign-bonds): the deficit sets how much is issued each quarter.
- [Sovereign Default](/wiki/sovereign-default): the debt-to-GDP ratio is what can push a country toward default.
- [IMF Sovereign Facility](/wiki/imf-sovereign-facility): revenue sets the payment cap and the deficit sets the loan size.
- [Crisis Interaction](/wiki/crisis-interaction): the treasury balance decides whether a funding option is available
- [Commodities](/wiki/commodities): Government healthcare and real estate spending drives commodity demand.
- [Cabinet Projects & Buildings](/wiki/cabinet-projects): The department appropriation sets the size of the building envelope.

## Status

Every world has national budgets for every country. The rules differ by country: US formula grants, regional budgets in the UK, Japan and Germany, the UK Budget vote, and East Germany's minimum borrowing limit. In worlds that start before 2000, fixed per-person policy costs are scaled down so early-era budgets are not hit by modern prices. IMF austerity applies only while a country is under a bailout.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants, formulas and when each step runs are on the [National Budget design page](https://docs.lakesidegames.net/design/national-budget.html).

See also: [Glossary](/wiki/glossary), [Sovereign Bonds](/wiki/sovereign-bonds), [Central Banks](/wiki/central-banks)
`;
