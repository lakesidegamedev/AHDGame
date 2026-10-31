export const corporateBondsContent = `# Corporate Bonds

You want to build a new plant and you do not want to sell shares to pay for it. A **corporate bond** is the alternative: a loan a corporation takes from the public. The company gets the cash now, pays interest (a **coupon**) every turn, and repays the full face value in one lump sum on the maturity date. Players can buy bonds for steady income. If the corporation cannot pay, the bond **defaults** and the company's rating and options suffer.

## Issuing a bond

Only the CEO can issue bonds, from the Credit & Bonds tab (under Finance) of the corporation page. Each bond unit has a face value of 1,000 in the bond's currency. The currency's bond market buys as many units as its cash and your rating allow at issue; those units sit in the public float, where any player or corporation can buy them. Any units it cannot take stay unplaced and sell turn by turn as the market's cash allows. The coupon is set by the prime rate, the corporation's credit rating and the term. The form shows the exact rate for each of the three terms before you commit.

![Bonds tab issue form showing the rate by maturity, the issuance cap and the debt headroom](/wiki-images/screens/corporate-bonds-issue-form.webp)

| Parameter | Details |
| --- | --- |
| Minimum issuance | ₳100,000 |
| Maximum total debt | 2x equity, and never more than what the corporation could realise by selling up (its plants at book, its cash, and the bonds it holds). The second cap is usually the binding one for a built-out corporation, and it is the same test the insolvency check applies, so a corporation inside its quoted ceiling cannot be judged insolvent. When that second cap is the binding one, the issue form says so. Refinancing defaulted debt is exempt, since it adds no debt. |
| Maximum per issue | 25% of annual revenue, with a floor of ₳500,000,000 |
| Unit face value | 1,000 per bond unit, in the bond's currency |
| Maturity options | 96 turns (2 years), 240 turns (5 years), 336 turns (7 years) |
| Coupon rate | prime rate + credit spread + 1.0pp + term premium (see below) |
| Issuance cooldown | 24 turns between issuances for publicly-listed corporations; 12 turns for private corporations |

**Blocked while under IMF restructuring:** If your corporation is under an active [corporate IMF restructuring](/wiki/imf), you cannot issue new bonds or refinance defaulted debt until the restructuring ends, and existing bonds are removed during a rescue. This is separate from a country's sovereign IMF facility.

Corporate bonds are issued in the corporation's home currency (see [Currency Exchange](/wiki/currency-exchange)). The proceeds for the units the market takes go directly to corporate liquid capital, and later placements of unplaced units are credited as they sell. A bond moved abroad with the corporation stays in the currency it was issued in. A subsidiary keeps its own bonds, which lets a bonded company be bought as a [subsidiary](/wiki/subsidiary-corporations).

Issuing makes sense to fund rapid expansion when your credit rating is strong (cheap debt beats diluting equity), to bridge a temporary cash crunch, or to finance an HQ relocation (cross-country moves cost 14% of market cap; a 7-year relocation bond is offered as an alternative payment method).

## What the coupon will be

Your corporation has a **credit rating** (0-100 composite score) based on four weighted factors:

| Factor | Weight | Description |
| --- | --- | --- |
| Debt-to-equity ratio | 30% | Lower ratio = better |
| Interest coverage ratio | 25% | Operating income vs. interest payments |
| Profitability | 25% | Return on equity |
| Liquidity | 20% | Liquid capital relative to short-term obligations |

The credit spread added to the prime rate reflects this score. A highly profitable corporation with low debt pays a coupon close to the prime rate. A heavily indebted or loss-making corporation pays a significantly higher spread. The country's [central bank](/wiki/central-banks) sets the prime rate. A change moves the coupon on every new issue and the price of every existing bond, but a bond's coupon is fixed for its whole life once issued.

Credit scores use **inertia smoothing** (changes phase in gradually instead of jumping instantly): each turn the new raw score is blended 75% new + 25% previous. This prevents a single bad turn from instantly nuking your rating. If your corporation has previously defaulted on a bond, a **credit penalty** applies for **96 turns**, locking your rating at CCC and capping your composite score. Debt, profit, liquidity and equity on your [corporation](/wiki/corporations) are what the rating reads.

Longer bonds command a higher coupon to compensate investors for locking up capital. The term premium is added on top of the credit-spread formula:

| Duration | Term premium |
| --- | --- |
| 2 years (96 turns) | +0.00pp |
| 5 years (240 turns) | +1.00pp |
| 7 years (336 turns) | +1.75pp |

**Full formula:** coupon rate = prime rate + credit spread + 1.0pp (corporate premium) + term premium

A BBB-rated corporation (credit spread 3.0pp) with a prime rate of 3.0% would pay:
- 2yr: 3.0 + 3.0 + 1.0 + 0.00 = **7.00%**
- 5yr: 3.0 + 3.0 + 1.0 + 1.00 = **8.00%**
- 7yr: 3.0 + 3.0 + 1.0 + 1.75 = **8.75%**

## Coupons, and the lump sum at the end

The corporation receives the face value in cash for every unit the market takes, pays a coupon every turn, and then repays the **whole face value in one payment on the maturity turn**, not gradually. Plan cash for it. Both the coupon and that repayment are charged on every placed unit, including units still sitting in the public float that no player has bought. Units that were never placed cost nothing. The issue card prices the principal due at maturity beside the interest, and the CEO sees a standing notice above every tab of the corporation page naming the next principal falling due. It reads "Due soon" once the repayment is within 24 turns, says so whenever current cash (or projected cash, if the corporation is retaining earnings) falls short of the amount owed, and becomes a warning that cannot be dismissed once a shortfall is within 48 turns.

Each turn the bond pays all current bondholders a share of its annual coupon: the face value times the coupon rate, divided by 48 turns a year. For a ₳100,000 bond at 8% coupon rate with 48 turns per year:
- Annual coupon: ₳8,000
- Per-turn payment: ₳8,000 / 48 ≈ ₳166.67

Payments are made from corporate liquid capital. If the corporation's liquid capital falls below zero after coupon payments and it also fails the solvency check, the bond **defaults** (see below).

A BBB-rated corporation issues **₳10,000,000** of 7-year (336 turn) bonds, which is 10,000 units. The prime rate is 3.0%, the credit spread is 3.0 points, the corporate premium is 1.0 and the 7-year term premium is 1.75, so the coupon is **8.75%**.

- Annual coupon: ₳10,000,000 x 8.75% = ₳875,000.
- Per turn (48 turns a year): ₳875,000 / 48 = about **₳18,229**.
- Over 7 years the corporation pays about ₳6,125,000 in interest.
- On turn 336 it must also repay **₳10,000,000 in one payment**. If that payment drives liquid capital below zero and the corporation's assets do not cover its debt, the bond defaults.

A buyer who pays par for 100 units (₳100,000) earns about ₳1,823 a turn in coupons and gets the ₳100,000 back at maturity.

## Bond prices after issue

Bond market prices fluctuate based on the current effective rate and time to maturity. The price is a fraction of face value (1.0 = par). It is the present value of the remaining coupons plus the present value of the face value returned at maturity, discounted at the current effective rate. The result is clamped between 0.05 and 2.0.

\`\`\`wiki-chart
corporate-bond-price-by-market-rate
\`\`\`

**Key relationships:**
- When rates **rise**, existing bond prices **fall** (your fixed coupon is worth less relative to new issuances)
- When rates **fall**, existing bond prices **rise**
- As a bond approaches maturity, its price converges toward par (1.0) regardless of rate movements. This **pull-to-par** effect dampens price volatility for bonds near maturity.
- If the bond defaults, its market price is fixed at **0.1** (10 cents on the dollar)

Bond holdings and debt also feed the [Stock Market](/wiki/stock-market) share price calculation, so defaults hurt it, and bond prices and defaults move the value of an [index fund](/wiki/index-funds) reserve.

## Buying, holding and buying back

Any player or corporation can buy bond units from the public float:

- **Players:** Payment from personal cash. Coupon payments received as personal income each turn. A [line of credit](/wiki/line-of-credit) counts that coupon income toward what you can borrow against, and a frozen line redirects it to the loan.
- **Corporations:** Payment from liquid capital. Coupon payments received as corporate income. Choose your corporation as the buyer to buy from its treasury.
- **NPP caretaker CEOs:** When the corp is profitable and cash sits above one day of revenue, they spend surplus cash on high-coupon home-currency paper from the public float. They will not buy the corp's own issue, and a loss-making corp keeps the cash as runway.

Buying suits steady income with minimal management, rate speculation (buy long-duration bonds when rates are high and prices are depressed, profit when rates fall), or distressed debt (buy defaulted bonds cheaply from the float and wait for the default to be cured at face value).

CEOs can also **buy back** their own bonds from the public float to reduce outstanding debt:
- Non-defaulted bonds: buyback at the bond market's current **asking price**
- Defaulted bonds: buyback at **face value** (1,000 per unit), which prevents buying distressed debt at a discount and immediately retiring it for a profit

The Credit & Bonds tab lists the bonds your corporation has **issued** (outstanding debt). The bonds it **holds** in other companies are on the corporation's portfolio page, in the Bonds section, with issuer names, units held and current market values.

## When a bond defaults

A bond defaults when the corporation's liquid capital goes negative after a coupon payment **or a maturity repayment** (the lump-sum principal is the trigger people miss), AND it fails a solvency check: the corporation's bond portfolio counts as an asset here, and while the game team has paused corporation actions no corporation is declared insolvent, though coupons and maturities still settle. A positive share buyback escrow can cover the shortfall first, and a corp whose total assets (valued the same way the restructure planner values them) still exceed its debt is judged illiquid rather than insolvent and does not default. Only a corp that fails both checks actually defaults. On default:

- Coupons stop from the next turn, and a maturity repayment that caused the default is not paid out. If the issuer is later dissolved, bondholders are paid ahead of shareholders from what the assets realise.
- The corporation's credit rating takes a **96-turn penalty**, locking it at CCC
- **Defaulted units left in the public float can still be bought** at the distressed price (fixed at 0.1), but holders cannot sell a defaulted bond back to the market
- CEOs **cannot** buy their own corporation's bonds at all (prevents self-dealing)

The game team can also place a corporation with outstanding bond principal into [IMF restructuring](/wiki/imf), for example after a default.

![How a missed coupon or maturity payment leads through escrow and a solvency check to default, then refinance, restructure or dissolution.](/wiki-images/diagrams/corporate-bonds-default-flow.svg)

### Refinancing defaulted debt

A CEO can **refinance** defaulted bonds by issuing a new bond for the full defaulted principal and migrating holders to it. This bypasses the normal issuance cooldown but still enforces the 2x equity leverage cap. A corporation can refinance defaulted debt at most **2 times** in its lifetime. Once the limit is reached, the CEO can still pay the defaulted principal from cash, restructure by selling sectors, or dissolve.

**National corporations** (government-owned) cannot refinance defaulted bonds, pay them off with cash or restructure: only private corporations have these options.

### If the CEO does nothing

If a corporation defaults and the CEO does not resolve the crisis, the turn processor auto-resolves it on a later turn (once the default is at least one turn old, so the CEO had a turn to act in the crisis modal). That is why a replacement bond can appear after a default you ignored. National and IMF-managed corporations are never auto-resolved. Resolution is tried in this order:

1. **Refinance (no sale):** if the corp is within its leverage limits and hasn't hit the refinance cap, a replacement bond is issued and holders are rolled into it. This preserves every sector, the least destructive outcome.
2. **Restructure (sell):** if refinance isn't feasible, the turn processor sells the **minimum number of sectors** needed, at orderly-sale salvage values, to repay **100% of defaulted principal**, cures the defaulted bonds, and keeps the corporation alive with its remaining sectors.
3. **Stand for dissolution:** if neither works, the default stands until the CEO dissolves and settles.

The CEO is notified and an audit entry is written for every auto-resolution. This closes the loophole of defaulting and ignoring the crisis when the balance sheet still has enough asset value (or refinancing headroom) to make creditors whole.

Distressed bond speculators can buy defaulted units from the float at 0.1 and wait for the cure: a cash payoff or a restructure repays holders at face value, and a refinance rolls them into the new bond at par. A dissolution pays only what the assets cover.

Applies in every world with private corporations; interest rates follow each country's central bank and the era's money. Last checked 2026-10-30, version 1.18.0. Exact rules: [Corporate Bond Defaults design page](https://docs.lakesidegames.net/design/corporate-bond-defaults.html)
`;
