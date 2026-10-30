export const pensionsContent = `# Pensions

Your employer starts paying a pension top-up and you do not know why. Almost always the scheme has dropped below 90% funded, usually because the bargained rate is under 8% or its fund units fell. An occupational pension is a retirement fund that a union **bargains for** from an employer, alongside wages. The employer pays into it every turn, the fund owes workers a growing promise, and the gap between what the fund holds and what it owes decides whether the employer is asked for extra money and whether pensioners get paid in full. It is the second retirement pillar. The state pension, paid out of the [National Budget](/wiki/national-budget), is a separate, always-on system that this page does not touch.

## Bargaining one into existence

The contribution rate is one of the terms in a union's [collective bargaining](/wiki/unions), negotiated the same way wage levels are. The bargained rate and the active agreement start and run the scheme. Either side's offer can propose a rate from **0% to 15%** of the covered wage bill (the wage cost of the sectors the agreement covers, set by [Labour & Wages](/wiki/labour-and-wages)). If mediation is needed, the settled rate lands between the two offers, closer to the union's the more leverage its mandate carries. The union's share of the gap runs from 35% at no leverage to 65% at full leverage.

Mediation splits the difference by leverage, so build your mandate before you press for a rate. With the union asking 10%, the employer offering 4% and leverage 50, the union's share is 50% and the deal lands at 7%.

If the settled rate is above zero, a **pension scheme** is created, one per union that has ever bargained one. A union that never won a pension has no scheme at all, not an empty one. Unions can put a pension rate in their offers and check the scheme's panel on the union page: cash, invested value, total assets, liabilities, benefits in payment, funding ratio and band, plus running totals of contributions, top-ups, benefits paid and unpaid.

## What happens each turn

For every active agreement carrying a pension rate, three things happen each turn, in this order:

1. **Contribution.** The employer pays covered wage bill x bargained rate into the scheme. If the employer cannot afford it that turn, the payment is skipped and never collected later, but the workers' claim still grows. The employer's cash pays contributions and top-ups, so they are a recurring cost for each [Corporation](/wiki/corporations); the financial statement has a Pensions line showing this turn's contribution and top-up, and how many of your schemes are in deficit. It is a live projection of what the agreement is charging you right now, not a history lookup.
2. **Top-up.** If the scheme's **funding ratio** (everything it holds divided by everything it owes) is below 90%, the employer is asked for an extra payment. It is only 5% of the gap to the 90% mark per turn, so a bad quarter cannot bankrupt an employer over a slow-moving number. Closing a deficit this way is slow by design. A top-up the employer cannot afford is skipped as well.
3. **Accrual.** The workers' claim against the scheme (its **liabilities**) grows by covered wage bill x 8%, whatever happened in steps 1 and 2.

![Each turn a pension scheme runs contribution, top-up, accrual, benefits and optional investment in that order.](/wiki-images/diagrams/pensions-turn-order.svg)

The accrual rate sits below the 15% ceiling on purpose. A scheme bargained at the ceiling builds a real surplus. A scheme bargained below 8% racks up a liability its contributions do not cover. An agreement with a 0% rate creates no scheme and accrues nothing. Contributions and accrual run only while the agreement is active.

| Item | Value |
| --- | --- |
| Contribution rate range | 0% to 15% of covered wage bill |
| Liability accrual | 8% of covered wage bill per turn |
| Top-up starts | funding ratio below 90% |
| Top-up pace | 5% of the gap to 90% per turn |
| Critical band | funding ratio below 60% |
| Claims coming into payment | 1% of claims not yet in payment, per turn |
| Benefits paid out | 2% of the in-payment stock, per turn |
| Cash kept for benefits | 8 turns of benefits |
| Most cash that can be invested | 90% of cash |
| Smallest investment worth making | 1,000 |

## Reading the funding ratio

| Band | Funding ratio |
| --- | --- |
| Surplus | above 110% |
| Funded | 90% to 110% |
| Deficit | 60% to 90% |
| Critical | below 60% |

What a scheme holds is its cash plus the market value of any fund units it owns, so a falling stock market lowers the ratio and can start top-ups. Below 90% the employer owes a top-up every turn until the ratio recovers. In the surplus band there is room to bargain the rate down or the pension up. The funding ratio is the argument both sides use at the next bargaining round. Benefit cuts depend on the scheme running short of cash, not on the band alone.

A rate under 8% is a promise that slides toward under-funding. A rate above 8% builds a surplus you can later bargain down. Employers can ride out a deficit cheaply, since top-ups are only 5% of the gap, but they never stop until the ratio is back above 90%.

## A 6% scheme over two years

An employer has a covered wage bill of 1,000,000 a turn and bargains a 6% rate. Each turn it pays 60,000 and the workers' claim grows by 80,000, so the scheme falls behind by 20,000 a turn. This ignores benefits and investment returns.

\`\`\`wiki-chart
pension-funding-by-rate
\`\`\`

| Turn | Employer pays | Top-up | Scheme holds | Scheme owes | Funding ratio |
| --- | --- | --- | --- | --- | --- |
| 1 | 60,000 | 0 | 60,000 | 80,000 | 75.0% |
| 6 | 60,000 | 0 | 360,000 | 480,000 | 75.0% |
| 7 | 60,000 | 600 | 420,600 | 560,000 | 75.1% |
| 12 | 60,000 | 3,179 | 731,601 | 960,000 | 76.2% |
| 24 | 60,000 | 7,233 | 1,518,565 | 1,920,000 | 79.1% |

The scheme is in the Deficit band from turn 1. Top-ups start in turn 7 and are tiny at first because they are 5% of the gap. The ratio creeps up, but slowly. At 12% the same employer pays 120,000, and the ratio sits at 150% from the first turn. The break-even rate is 8%, where contributions match accrual exactly.

If the employer cannot pay in some turn, the 60,000 simply does not arrive. The 80,000 claim still accrues, so the gap widens.

## Paying pensioners

Union membership is tracked as a rate across a sector's workforce, not person by person. So benefits are not paid to named retirees. They flow against the modelled covered workforce as a whole. About **1% of the claims not yet in payment** come into payment each turn, and **2% of the in-payment stock** is paid out each turn. That is a deliberately slow drain, so underfunding is a visible, gradual problem and not a one-turn cliff.

**Benefits are only paid from cash on hand, never borrowed.** If a scheme's cash falls short of what is due, every claim in payment takes the **same proportional cut** that turn. The unpaid part is not forgiven. It stays on the books as a liability, which is why the funding ratio keeps looking bad until the scheme catches up. If an agreement ends, the employer stops paying in and claims stop accruing, but benefits already in payment keep coming out of the scheme's cash.

## Where scheme cash gets invested

A scheme with cash on hand can put some of it into index funds (see [Index Funds](/wiki/index-funds)), the same way any other investor does, in worlds where index funds are available. Schemes buy broad fund units, adding demand and a long-term holder. This is optional. Every other pension rule keeps working from cash alone if index funds are off.

Two limits stop a scheme from over-committing: it always keeps **8 turns of benefit payments** in cash, and it never invests more than **90% of its cash**. It buys a broad index fund from its own country, falling back to a global broad fund. Sector funds are never eligible, because putting a union's pension money into the sector its members work in is exactly the risk this rule avoids. Invested units are valued at the fund's current price every turn.

Pensions exist only where a union has bargained one into an agreement. Investing happens only in worlds where index funds are available. Elsewhere schemes hold cash and everything else works the same. Last checked 2026-10-29, version 1.18.0. Exact rules: [Pensions (design)](https://docs.lakesidegames.net/design/pensions.html). See also: [Glossary](/wiki/glossary)
`;
