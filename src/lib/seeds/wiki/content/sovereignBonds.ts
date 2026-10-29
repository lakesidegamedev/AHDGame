export const sovereignBondsContent = `# Sovereign Bonds

**Sovereign bonds** are government debt. A country that spends more than it taxes issues bonds to cover the gap, and players, corporations and imperial characters buy them for steady coupon income. They trade like [corporate bonds](/wiki/corporate-bonds) but are backed by a whole nation, and they do not default through the bond system. Instead, a separate [sovereign default](/wiki/sovereign-default) crisis handles a country that can no longer sell its debt.

## How it works

A country with a national budget issues bonds on a schedule: every 12 turns it issues a quarter of its annual deficit, plus a rollover of any bonds about to mature. Each bond unit has a face value of 1,000 in the issuer's currency and starts in the public float. The coupon is the central bank's prime rate plus a term premium and any credibility spread. Coupons are paid to holders each turn from the national treasury, and the face value is repaid at maturity.

### Key numbers

| Rule | Value |
| --- | --- |
| Issuance interval | Every 12 turns |
| Deficit issued per interval | A quarter of the annual deficit, rounded down to whole 1,000 units |
| Standard maturity | 48 turns (1 game year) |
| Longer paper (from debt reconciliation) | 96 and 240 turns, +0.25 and +0.75 points over the 48-turn coupon |
| Unit face value | 1,000 in the bond's currency |
| Issue price | 1.0 (par) |
| Minimum purchase | 1 unit |
| Failed auctions before a default crisis | 3 in a row, each with demand below 0.7 of supply |
| Public trust penalty at BB / B / CCC | -5 / -10 / -15 |

### Worked example

A country with a prime rate of 3.0% and an annual deficit of 240,000,000 issues 60,000,000 of new bonds this quarter, which is 60,000 units. The coupon is 3.0% (no term premium for 48 turns, no credibility spread).

You buy 100 units for 100,000. You earn 100,000 x 3.0% = 3,000 a year, or **62.50 per turn**, and get 100,000 back after 48 turns.

Now the central bank raises the prime rate to 5.0% straight after you buy. Your bond still pays 3.0%, so the market price falls to 0.981, and selling immediately returns about 98,100. If you hold to maturity the price pulls back to par and the drop does not matter. Selling before maturity is where rate risk bites.

## What they are

When a country runs a budget deficit, it needs to borrow money to cover the gap. The government issues sovereign bonds: players, corporations, and imperial characters buy them, the government gets cash, and bondholders receive regular coupon payments until the bond matures.

## Active issuers

| Country | Currency | Maturity |
| --- | --- | --- |
| United States | USD | 48 turns (1 game year) |
| United Kingdom | GBP | 48 turns (1 game year) |
| Japan | JPY | 48 turns (1 game year) |
| Germany | EUR | 48 turns (1 game year) |
| Ireland | EUR | 48 turns (1 game year) |
| Brazil | BRL | 48 turns (1 game year) |
| China | CNY | 48 turns (1 game year) |
| Nigeria | NGN | 48 turns (1 game year) |

All configured countries with a national budget issue sovereign bonds automatically. Regular issuance for every issuer has the same 48-turn (1 game year) maturity. Longer paper of 96 and 240 turns also exists, created when a country's existing debt is reconciled into instruments; it carries a term premium of +0.25 and +0.75 percentage points over the 48-turn coupon.

Each sovereign bond is denominated in the issuing country's currency. A US Treasury bond pays coupons in USD; a UK gilt pays in GBP; a Japanese government bond pays in JPY.

## Automatic issuance

Sovereign bonds are issued **automatically every 12 turns** (once per game quarter, 12 turns). You cannot manually trigger issuance: it happens on schedule regardless of who is in office.

Each quarter, the issuance amount has two components:

**Deficit component:**
\`\`\`
quarterlyAmount = annualDeficit / 4
deficitAmount = floor(quarterlyAmount / 1,000) * 1,000
\`\`\`
If the budget is in surplus, this component is zero. The amount is rounded down to a whole bond unit (1,000 face value).

**Rollover component:**
Any sovereign bonds maturing in the upcoming 12 turns are refinanced. Their total face value is reissued as new bonds. This keeps the bond market liquid even when the country is running a surplus: the float replenishes automatically.

## Coupon rate

Sovereign bonds use the **central bank prime rate** as their base, plus a term premium for longer maturities and any credibility spread the issuing bank has accumulated:

\`\`\`
couponRate = primeRate + termPremium + credibilitySpread
\`\`\`

Unlike corporate bonds, there is no separate corporate risk premium. But a bank whose Chair has let scrutiny climb pays a credibility spread on top of the base rate, so sovereigns are not entirely immune to credit-style pricing. When the [Central Bank Chair](/wiki/central-banks) raises rates, newly issued bonds carry higher coupons.

## Bond structure

| Field | Value |
| --- | --- |
| Face value | 1,000 per unit (in the bond's currency) |
| Maturity | 48 turns (1 game year) |
| Market price at issuance | 1.0 (par) |
| Units start in | Public float (available to buy immediately) |
| Can default in bond processor | No; sovereign distress is handled by the crisis system |

## Budget integration

When sovereign bonds are issued, the national budget is updated immediately:

- **Principal increases** by the total face value issued
- **Annual interest cost** increases by \`couponRate% * totalIssued\`
- **Surplus decreases** (or deficit increases) by the new interest cost
- **Debt-to-GDP ratio** updates, which affects the country's credit rating

When bonds mature, the process reverses: principal and interest obligations are reduced, improving the surplus figure.

## Per-turn processing

Each turn, the bond system:

1. Issues any scheduled sovereign bonds (every 12 turns)
2. Pays coupon interest to all holders from the national treasury
3. Updates market prices based on current interest rates and time to maturity
4. Settles matured bonds (returns face value to holders, reduces national debt)
5. Records history snapshots

Sovereign bond coupons are ledgered as government coupon payments. This is not
the same as the Monetize sovereign-crisis resolution. Monetize is a separate
executive action and is blocked once inflation reaches 8%.

![Every twelve turns a quarter of the deficit plus a rollover is issued into the public float; each turn coupons are paid and matured bonds repaid, and the budget is updated.](/wiki-images/diagrams/sovereign-bonds-issuance-flow.svg)

## Market price dynamics

Sovereign bond prices update each turn based on the present value of remaining cash flows:

The price is the present value of the remaining coupons plus the present value of the par repayment, discounted at the current prime rate.

\`\`\`wiki-chart
sovereign-bond-price-by-prime-rate
\`\`\`

- **Rising prime rates → falling prices** (existing bonds become less attractive)
- **Falling prime rates → rising prices** (existing bonds offer above-market coupons)
- **Near maturity:** Price converges toward par regardless of rates
- **Recovery value:** If a corporate bond defaults, price drops to 0.1 (10 cents on the dollar). Sovereign bonds do not default in the bond processor.

## Buying sovereign bonds

From any country's stock exchange page, you can browse available sovereign bonds and buy units:

- **Players:** Purchase from personal cash, receive coupon payments each turn (in the bond's currency)
- **Corporations:** Purchase as an investment, coupons flow into liquid capital
- **Imperial characters:** Can also hold bonds and receive coupon income

There is no minimum purchase amount beyond 1 unit (1,000 in the bond's currency).

### Currency handling

Bond coupon payments and maturity returns are paid in the bond's denomination currency. For character holders, the system auto-converts foreign-currency bond income to the holder's home currency at the market-maker rate, which includes a spread. Corporate holders receive coupons in their own liquid capital currency.

## Credit rating tiers

The country's debt-to-GDP ratio determines its credit rating, which affects the interest rate the government pays on new debt:

| Debt-to-GDP | Rating | Interest Rate | GDP Growth Penalty | Public Trust Penalty |
| --- | --- | --- | --- | --- |
| <= 60% | AAA | 2.0% | 0 | 0 |
| <= 80% | AA | 2.5% | 0 | 0 |
| <= 100% | A | 3.5% | -0.1% | 0 |
| <= 120% | BBB | 5.0% | -0.2% | 0 |
| <= 150% | BB | 7.0% | -0.3% | -5 |
| <= 250% | B | 10.0% | -0.5% | -10 |
| > 250% | CCC | 14.0% | -0.7% | -15 |

\`\`\`wiki-chart
sovereign-bond-rating-tiers
\`\`\`

Public-trust penalties apply at fiscal year close. The table's GDP value is implemented as per-turn corporate margin drag, not as a direct write to the country's displayed GDP-growth metric. Risk scoring uses the country's current smoothed debt-to-GDP ratio; the historical sovereign-risk anchor is retained for seed and migration provenance, but does not rescale live risk.

## How national debt affects corporations

High sovereign debt has real economic effects on corporations through two channels:

### Debt-to-GDP margin penalty

| Debt-to-GDP | Corporate margin effect |
| --- | --- |
| Below 50% | No penalty |
| 50-100% | -0.5% per 10 percentage points |
| Above 100% | -2.5% base + -1% per additional 10 pp, capped at -5% |

This means a heavily indebted country actively hurts every corporation operating there, though the penalty is capped well short of crippling margins outright. Passing legislation to reduce the deficit (raising taxes or cutting spending) improves conditions for corporations across the board.

### Deficit stimulus

Conversely, deficit spending provides a short-term stimulus: **+0.5% to all corporate margins per 1% of GDP deficit**, capped at +5%. This is a separate effect from the debt penalty: a country can have both high debt (hurting margins) and an active deficit (helping margins) simultaneously.

## Sovereign default crisis

While sovereign bonds do not "default" in the ordinary bond processor, a country can enter a **sovereign default crisis** when **three consecutive fiscal-year sovereign bond auctions fail** (market demand ratio below 0.7). Auctions are evaluated once a year at fiscal year close, so this takes three years in a row. When this happens:

- The country enters crisis status
- The Executive proposes one of four resolutions: **IMF Bailout**, **Repudiate**, **Restructure**, or **Monetize**
- The Legislature ratifies (or rejects) the choice
- Existing bonds may be restructured (haircut + maturity extension) or repudiated (written down)

See the country dashboard and the World Crises page for crisis tracking, and [Sovereign Default](/wiki/sovereign-default) for the resolutions. A separate **Debt Sustainability Index** (0 to 100) provides a forward-looking warning gauge but is not the crisis trigger itself.

## Strategic uses

**Income strategy:** Sovereign bonds are the safest income-generating investment in the game. No default risk in the bond processor, predictable coupon payments, and automatic maturity settlement.

**Rate speculation:** Buy when prime rates are high (prices are depressed) and sell when rates fall. The Central Bank Chair's rate decisions directly move sovereign bond prices.

**Fiscal politics:** If you hold significant sovereign debt, you have a financial interest in keeping the country solvent. Debt-reducing legislation benefits both your bond portfolio and your corporate sectors.

**Currency play:** Sovereign bonds are denominated in the issuer's currency. If you expect JPY to strengthen against your home currency, buying Japanese government bonds gives you both coupon income and FX appreciation.

## What you can do

- **Buy bonds** from any country's stock exchange page, with personal cash or your corporation's treasury. One unit is the minimum.
- **Hold to maturity** for predictable income, or sell early if you expect rates to fall.
- **Watch the prime rate and debt-to-GDP.** The [Central Banks](/wiki/central-banks) chair's decisions move prices; rising debt lowers the credit rating and raises costs.
- **As a legislator or executive,** deficit choices in the [National Budget](/wiki/national-budget) decide how much is issued and how heavy the debt is.

### Common questions

- **What does buying bonds do?** You lend to the government and receive the coupon every turn, then your face value at maturity.
- **Where do I buy them?** On the country's stock exchange page.
- **Do they default?** Not in the bond system. If demand collapses for three fiscal years, a default crisis opens and the government may restructure or repudiate, which can write bonds down.
- **Which pays more, a sovereign or a corporate bond?** Corporate bonds pay a credit spread plus a 1.0 point premium over prime, so they pay more because they carry company risk. See [Corporate Bonds](/wiki/corporate-bonds).

## Connections

**Driven by**

- [Central Banks](/wiki/central-banks): the prime rate sets the coupon and moves prices.
- [National Budget](/wiki/national-budget): the deficit sets how much is issued each quarter.
- [National Metrics](/wiki/national-metrics): debt-to-GDP sets the credit rating and borrowing cost.
- [Currency Exchange](/wiki/currency-exchange): exchange rates change the home-currency value of foreign bonds.
- [Sovereign Default](/wiki/sovereign-default): a default or restructure writes bonds down and closes the market for 16 to 48 turns.
- [Nationalization & National Corporations](/wiki/nationalization): low investor confidence after takings raises the government's borrowing rate.
- [Line of Credit](/wiki/line-of-credit): A frozen line of credit redirects coupon income to the loan.

**Affects**

- [National Budget](/wiki/national-budget): issuance adds principal and interest cost and lowers the surplus.
- [Sovereign Default](/wiki/sovereign-default): repeated failed auctions open a default crisis.
- [Corporations](/wiki/corporations): high debt-to-GDP cuts every corporation's margin there, and deficits give a stimulus.
- [IMF Sovereign Facility](/wiki/imf-sovereign-facility): bonds maturing within 12 turns count toward the loan size.
- [Line of Credit](/wiki/line-of-credit): Coupon income counts toward the income a player can borrow against.

## Status

Sovereign bonds are live in every world where the country has a national budget, which covers the eight modelled issuers (United States, United Kingdom, Japan, Germany, Ireland, Brazil, China, Nigeria) and any other country with a budget. Countries without a national budget do not issue. Rates and credit tiers follow each country's own central bank and debt.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Sovereign Bonds design page](https://docs.lakesidegames.net/design/sovereign-bonds.html).
`;
