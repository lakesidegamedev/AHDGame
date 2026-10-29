export const currencyExchangeContent = `# Currency Exchange

You own shares in a Japanese company, the share price has not moved, and your holding is worth more anyway because the yen strengthened. That is the **foreign exchange (forex)** system at work. Each active country has its own floating currency, players can trade currencies for profit, and investments abroad settle in the currency of the asset's country, so exchange rates change what your holdings, dividends and bond coupons are worth at home.

Planned economies work differently: a fully command country's official rate is fixed and does not float with macro conditions or player volume. See [Planned / Command Economies](/wiki/planned-economies).

| Rule | Value |
| --- | --- |
| Drift toward macro target | 5% of the gap per turn (about 90% after a game year, 48 turns) |
| Random noise | ±0.4% per turn |
| Regime pressure | 12-turn windows, 0.07% or 0.15% a turn, either way, or neutral |
| Rate guardrail | Within ±50% of the base rate |
| Trading volume lookback | 24 turns; volume push capped at ±5% |
| Market maker spread | 1% |
| Public limit order spread | 0.64% |
| Direct player trade spread | 0.36%; offers expire in 24 turns |
| Size fee on your own trades | Rises toward 20%, total fee never above 30% |
| Where fees go | 25% destroyed, 25% central bank forex revenue, 50% that currency's reserve pool |

## Converting money

There are three ways to swap currencies, cheapest last:

| Tier | Method | Spread | Fill |
| --- | --- | --- | --- |
| 1 | Market maker | 1% | Instant, always available |
| 2 | Public limit order | 0.64% | When market rate meets your limit |
| 3 | Direct player trade | 0.36% | When target player accepts |

**Tier 1 (Market Maker):** Instant fill at the current rate with a 1% base fee. Used automatically for auto-convert purchases. Volume pressure still applies.

**Tier 2 (Limit Orders):** Post a public order at a target rate. The order auto-fills when the market price crosses your limit (0.64% spread). Other players can manually fill it early for a direct player trade fee instead. Set an optional expiry in turns. Order fills send automatic [mail](/wiki/mail).

**Tier 3 (Direct Trades):** Send a specific currency offer to a named character. They can accept or decline, no counter-offers. Expires after 24 turns by default.

**Size and market fee:** Your own trades (market maker and limit orders) also pay a size fee that rises toward 20% on very large conversions. It counts everything you converted in the last 24 turns, so splitting a big trade into small ones costs the same. The whole fee is then scaled by how busy the two currencies are: 0.5x in a busy market, up to 1.5x in a quiet one. The total never passes 30%. Conversions the game makes for you (dividends, coupons, purchase shortfalls) pay only the base fee.

You convert 100,000 USD to GBP through the market maker. At 0.75 that is 75,000 GBP, less a 1% fee of 750 GBP, so you receive **74,250 GBP**. Of the 750 fee, 187.50 is destroyed, 187.50 becomes forex revenue for the pound's central bank and 375 goes into the pound's reserve pool. Very large conversions pay an extra size fee.

Spread fees are split three ways: **25% destroyed** (deflationary sink), **25%
booked as the currency's central-bank forex revenue**, and **50% added to that
currency's central bank reserve pool**. That currency-specific pool is separate
from the central bank's general reserves.

![The three trading tiers with their spreads and fills, and how the spread fee splits into destroyed, forex revenue and reserve pool shares.](/wiki-images/diagrams/currency-exchange-tiers-and-spread.svg)

### Where foreign money lands

Your character has two money pools:

- **Campaign funds:** Always in your home currency. Used for campaign spending, ads, and party actions. Never converted or held in foreign currency.
- **Personal wealth:** Multi-currency. Each currency is a separate balance. Foreign income deposits directly into the relevant currency slot.

When making personal purchases in a foreign currency:
1. Spend from your existing balance in that currency (free, no spread)
2. If you lack enough, auto-convert the shortfall from your home currency (1% spread)
3. If both are insufficient, the transaction is rejected

Income from foreign corporations is handled differently by type:

- **Dividends:** Automatically converted to your home currency at the market-maker rate (1% spread), so a foreign dividend arrives a little smaller. There is no per-holding preference: this conversion is automatic. See [Stock Market](/wiki/stock-market).
- **Bond coupons:** Character coupons auto-convert to the holder's home currency at the market-maker spread. [Corporate Bonds](/wiki/corporate-bonds) pay in the issuer's currency, and [Sovereign Bonds](/wiki/sovereign-bonds) coupons and returns convert at the market-maker rate.
- **CEO salary:** Paid in the corporation's home currency and deposited directly into your personal balance in that currency. No auto-conversion.

## What moves a rate

Every currency has a rate against an internal anchor unit. Cross-rates are derived from these (USD/JPY = JPY rate / USD rate). Each turn a rate moves under four forces: a drift toward a target set by the country's economy, pressure from recent trading, small random noise and a 12-turn directional regime. The more a country's rates, inflation, growth and trade stray from neutral, the more its currency drifts.

### The macro target

A country's rate drifts toward a target based on its prime rate, inflation, growth and trade, compared with neutral baseline values:

> target = base rate x (1 - 0.02 x prime gap + 0.015 x inflation gap - 0.01 x growth gap - 0.005 x trade gap)

A higher prime rate lowers the rate number, which means a stronger currency. Higher inflation weakens it. Higher growth or a trade surplus strengthens it. A country with inflation above 6% takes an extra direct hit on top. The prime rate is the biggest input, set by the [Central Bank Chair](/wiki/central-banks) (in the US, a new prime rate set by the [committee](/wiki/fomc) moves the dollar's target), and inflation, growth and trade come from [National Metrics](/wiki/national-metrics).

| Country | Baseline prime | Baseline inflation | Baseline GDP growth | Baseline trade |
| --- | --- | --- | --- | --- |
| US | 3.0% | 2.0% | 2.5% | 0% |
| UK | 3.0% | 2.0% | 1.5% | 0% |
| Japan | 1.0% | 1.0% | 1.0% | 0% |
| Germany | 3.0% | 2.0% | 1.5% | 0% |
| Ireland | 3.0% | 2.0% | 3.5% | 2.5% |
| China | 4.0% | 2.0% | 5.0% | 4.0% |
| Brazil | 8.0% | 4.0% | 2.5% | 2.0% |

The UK central bank raises its prime rate from 3.0% to 5.0%. The prime gap is 2 points, so the GBP target falls by 2 x 0.02 = 4%: from 0.75 to 0.72 per anchor unit, a stronger pound. The rate drifts 5% of the gap per turn, so the first turn moves it from 0.75 to 0.7485, and it takes roughly a game year to cover 90% of the way. When a central bank changes rates, existing bond prices move too, and so does the exchange rate. Both effects compound for cross-country bond holders.

\`\`\`wiki-chart
currency-rate-path-after-prime-rise
\`\`\`

### Trading volume, noise and regimes

Net buying or selling over the past 24 turns nudges the rate each turn. Everyday trading barely registers. The push from traded volume reaches half of its 5% cap only at ₳1B of net buying or selling, and it counts for 5% of the rate's direction, so macro fundamentals do almost all of the work. **Breadth** is how many traders stand behind the flow: it takes about five for the full push, and one trader alone gets a fifth of it, so a single fortune cannot move a currency by itself. Central-bank intervention keeps the stronger original channel (up to a 1% push a turn), so a bank can lean against a large traded flow, and market pressure on the currency decides whether a central bank FX band holds.

Per-turn jitter of **±0.4%** prevents perfectly predictable movements.

A 12-turn directional regime applies independently of macro fundamentals,
trading volume, and noise. Each window rolls one of five regimes at random:
a moderate or slight push stronger (0.15% or 0.07% a turn), neutral, or the
same push weaker.

Rates are capped at ±50% from their base rate. A currency cannot hyperinflate or collapse beyond that floor/ceiling.

### The currencies

| Country | Currency | Code | Modern default rate (vs. internal unit) |
| --- | --- | --- | --- |
| United States | US Dollar | USD | 1.0 |
| United Kingdom | Pound Sterling | GBP | 0.75 |
| Japan | Japanese Yen | JPY | 106.0 |
| Germany / EU | Euro | EUR | 0.92 |
| China | Chinese Yuan | CNY | 7.2 |
| Brazil | Brazilian Real | BRL | 5.0 |
| Nigeria | Nigerian Naira | NGN | 1,550.0 |

Many currencies are active in forex trading. The table above shows the main modern defaults; historical presets use era-specific rates. For example, a 1953 world
starts GBP at 0.357, JPY at 360, and NGN at 0.357 per anchor unit. Intermediate
start years interpolate geometrically between authored anchors.

Rates are measured against an internal "anchor" unit, not directly against each other. Cross-rates are derived: USD/JPY = jpyRate / usdRate.

## Where forex shows up elsewhere

**Cross-country investments:** If you buy JP stock at ¥26,900 per share and the yen strengthens against your home currency, your holding is worth more in home-currency terms even if the share price didn't move.

**Corporate economics:** [Corporation](/wiki/corporations) revenues and costs are denominated in the corporation's home currency. When a US corporation's sector operates in Japan, the revenue is earned in USD (the corp's currency) but taxed at Japanese rates against a JPY-denominated tax base. Cross-country HQ relocations trigger a full treasury conversion at the spot rate.

**Banks:** The prop desk's forex positions in [Private Banking](/wiki/private-banking) are marked at market rates.

**Prices at home:** A weaker currency raises import prices and inflation, which is why [National Metrics](/wiki/national-metrics) feels the exchange rate. The real-rate savings yield in [Savings & Interest](/wiki/savings-interest) stops currencies from paying a free carry.

## Speculating

The standard forex speculation flow:
1. Identify a country with weakening fundamentals (high inflation, slow growth, low rates)
2. Wait for the currency to reach a cycle low
3. Buy a meaningful position (limit orders save on spread)
4. Invest in that country's assets while holding the cheap currency
5. Sell when the currency recovers or fundamentals improve

The 24-turn volume lookback means heavy buying gradually pushes the rate down (strengthening the currency further), accelerating your returns, but also attracting other speculators who may exit before you. Watch a country's prime rate, inflation and growth, and remember one player cannot move a currency alone.

Applies in every world with more than one active currency. Historical presets start from era-specific rates, and fully planned countries keep a fixed official rate. Last checked 2026-10-29, version 1.18.0. Exact rules: [Currency Exchange design page](https://docs.lakesidegames.net/design/currency-exchange.html)
`;
