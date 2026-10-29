export const centralBanksContent = `# Central Banks

Every country with an active central bank has a **Central Bank Chair**, a player post that sets the country's **prime interest rate**. The prime rate is the base price of money: it moves savings yields, loan costs, bond coupons, the exchange rate and inflation. The chair is judged on inflation and growth through a score called **scrutiny**, and the chair also holds levers over bank reserves, the currency and who controls the bank.

Fully command economies run a passive monobank instead and the automatic rate setter does not fire. See [Planned / Command Economies](/wiki/planned-economies). The US Federal Reserve is run by a committee, covered on [FOMC / Rate-Setting Board](/wiki/fomc).

## How it works

Each turn the game scores the chair, and each time the chair acts the game checks the move against hard limits. The numbers you plan around:

| What | Value |
| --- | --- |
| Prime rate range | 0% to 25%, in steps of 0.25 |
| Largest hike in one move | 0.75 points, or 3 points while inflation is at least 5 points over target |
| Largest cut in one move | 1.75 points. A cut bigger than 0.75 costs 10 scrutiny |
| Wait between rate changes | 6 turns |
| Chair term | 192 turns (4 game years) |
| Time to accept a nomination | 24 turns |
| Scrutiny that costs you actions | Above 25: you lose 1.5 actions per turn |
| Chair bonus | +3 actions per turn, plus the cabinet tier of national influence (+1.5 per turn) |
| Scrutiny gain | Capped at 8 per turn. Decays 5% per turn |
| Relief for holding a correct stance | 6 scrutiny after 3 turns in a row |
| Price of government interference | 12 for a rate override, 18 for dismissal, 22 for a statute |
| Scrutiny the next chair inherits | 75% |
| Currency regime change | Once per 48 turns |
| FX band: narrowing or cancelling | 6-turn cooldown. Failed defence adds 15 scrutiny |
| Reserve requirement | 5% to 95%. Default 10% (modern worlds) or 20% (historical) |
| QE, QT and other money operations | One operation per 6 turns |

Position bonuses do not stack: your national influence is the highest tier you hold, while the +3 actions stack with any other office.

### Scrutiny

Scrutiny (0 to 100) is the chair's public record. Each turn:

\`\`\`
scrutinyDelta = (inflation - targetInflation) x 0.5 + (2.0 - gdpGrowth) x 0.5
\`\`\`

The growth target is 2.0%. Inflation targets are set per country (most developed markets use 2.0%). A miss pushes scrutiny up, good numbers push it down, and 5% of the existing score fades each turn. When the delta is a relief, it is dampened as scrutiny rises: it is multiplied by max(0.1, 1 - scrutiny / 150), so at 75 scrutiny, good news counts half.

**Worked example.** A chair with 20 scrutiny faces 4% inflation (target 2%) and 1% growth. The delta is (4 - 2) x 0.5 + (2 - 1) x 0.5 = +1.5. Next turn: 20 x 0.95 + 1.5 = 20.5. A bad month adds up, but a single bad turn can never add more than 8.

Scrutiny is not only a score. A discredited bank is believed less, which costs the country:

- Rate moves shift inflation expectations by 0.6 + 0.4 x (1 - scrutiny / 100) of their full effect. A spotless bank gets all of it, a ruined one 60%.
- New sovereign bond coupons carry up to 1.5 extra points at 100 scrutiny, in a straight line (1.5 x scrutiny / 100).
- An FX defence buys 70% to 100% of its normal market effect, and the reserve cost is the same either way.
- Domestic banks capture 80% to 100% of the household deposits they would otherwise win.

\`\`\`wiki-chart
central-bank-scrutiny-multipliers
\`\`\`

Policy still works at any scrutiny. A discredited bank can still cause a recession with a big enough hike. It just costs more to be believed.

### Buying your way back: resolve

Results are slow, nerve is not. If your prime rate sits within half a point of the bank's policy target (set from the neutral rate, inflation, and growth) for **3 turns in a row**, scrutiny falls by 6, whatever inflation does. The streak then restarts. Break it and it resets to zero. The chair panel shows your streak.

**Worked example.** At 40 scrutiny with inflation on target and growth at 2%, three correct turns go 40, 38.0, 36.1, then 34.3 - 6 = 28.3.

### Independence and interference

A government can take control of its bank. The price is paid in scrutiny by the **institution**, not the person: 12 to set the rate directly (only while the bank is government-controlled), 18 to dismiss the sitting chair, 22 to revoke independence by statute. Granting independence refunds nothing, so repeated grants and revocations cannot launder the score.

A chair change at term end or by resignation keeps 75% of the score. A dismissal keeps all of it and adds 18, so firing a chair is always worse than waiting. The Bank of England had no operational independence until 1997, so a British world that starts earlier opens with the Treasury setting Bank Rate, and Parliament must legislate the change. Time passing does not do it. A bank shared across countries, like the European Central Bank, cannot have its independence legislated by one member.

## What you can do

**Become Chair.** Outside the US, when a term ends a new chair is drawn from characters nominated by the country's executives. Lobbying shifts the odds: weight is 1 + lobbying / 500,000, so spending 500,000 doubles your weight. The chosen player has **24 turns to accept**. If you decline, or let the clock run out, the draw repeats without you for that cycle. If no one is available, the seat is left vacant or an autonomous caretaker is seated. The caretaker sets the rate by rule, weighing measured slack (the output gap and unemployment), until a player takes over. Is it worth it? You gain +3 actions and the influence, and you risk losing 1.5 actions per turn once scrutiny passes 25, so the net is +1.5.

**Set the prime rate.** Overview tab on the Central Bank page. Check the real rate (prime minus inflation) against the neutral rate shown there, and check slack: high unemployment makes a cut less inflationary. Then move within the limits.

\`\`\`guide-screenshot
central-bank
\`\`\`

*The Federal Reserve page. The header shows the prime rate, inflation, savings flow, and reserves. The rate corridor shows the prime rate against the inflation band, and the left panel shows the Chair's term and public scrutiny.*

If a rate change is refused, one of these applies: the 6-turn wait, a size limit, the 0 to 25 range, a currency peg with open capital (see below), a government-controlled bank, or a command economy.

**Money operations (Money supply tab).** QE has the bank buy units of one of the country's sovereign bonds from the public at market price, and the cash it pays is new money. QT sells bank-held units back and destroys the cash. You choose the bond and the number of units, limited by the units available. At most one operation per 6 turns. Holdings lift that bond's price by half the bank's share of the issue, up to 20%. These move money and bond prices first and real activity later, so use them when the bond market is broken or the rate is stuck, not as a growth button. Liquidity injections are capped at 3% of GDP and direct treasury advances at 1% of GDP.

**Choose the exchange-rate regime (currency regime panel on the Central Bank page).** Float, band, or peg. A country cannot have a fixed rate, free capital and its own policy rate at once. Peg or band with open capital and the policy rate is no longer yours: rate changes are refused until you float or impose capital controls. Floating with capital controls is legal but wasteful. Floating cancels any standing band. A regime can change once per 48 turns.

**Defend the currency (FX intervention tab).** Post a floor, a ceiling, and an optional maximum spend per turn. Blank means 10% of usable reserves; zero pauses spending. When the market rate leaves the band, the bank sells or buys to push it back, with at most 1% of rate pressure per turn (a peg has a 0.05% tolerance). Selling draws the currency's spread-fee reserves first, then Forex Revenue, then the general Reserve Balance. Buying the home currency needs foreign reserves; treasury cash alone cannot defend a weak currency. If the rate is still outside the band after all reserves are spent, scrutiny rises by 15 once per breach. Widening a band is free, but narrowing or cancelling waits 6 turns. The Finance Minister can move up to 0.5% of annual federal revenue per turn into reserves. Pegged or banded currencies are also covered on [Currency Exchange](/wiki/currency-exchange).

**Set the reserve requirement (Reserves tab).** Where [Private Banking](/wiki/private-banking) is open, the chair sets what share of deposits banks must hold back, from 5% to 95%. A bank's lendable room is deposits x (1 - requirement) minus loans. Raise it and banks at the old limit are frozen out of new lending. Lower it and room opens at once.

**Read the deposit insurance fund (Insurance tab).** The fund is paid for by banks, not by the state. Each bank pays 0.4% a year on insured deposits, split across the turns, scaled by 0.5x to 3x depending on how thin its reserves are against the requirement. Deposits are insured up to a cap anchored at 5,000,000 in modern reference terms and scaled per currency and era. When a bank fails, insured balances are kept whole from the recovery pool, then the fund, then treasury cash, and any shortfall is funded by bonds. The expense shows in the federal budget.

**Tips.**

- Compare the real rate with neutral, not the nominal rate. A 2% prime with 5% inflation is loose.
- Hike early. A bank that waits for inflation to peak has already lost credibility.
- Do not cut into a supply shock. Easier credit does not make oil or food.
- Do not defend a band the market does not believe, and cancel it before reserves run dry.
- Do not fire a chair to reset scrutiny. Waiting costs less.

## What a rate move does

The prime rate feeds several systems at once:

- **Bonds.** New corporate bonds pay prime plus a credit spread. Sovereign bonds pay prime plus a term premium plus any credibility spread from scrutiny. See [Corporate Bonds](/wiki/corporate-bonds) and [Sovereign Bonds](/wiki/sovereign-bonds).
- **Savings and credit.** Savings pay half the real rate and lines of credit are priced off prime. See [Savings & Interest](/wiki/savings-interest) and [Line of Credit](/wiki/line-of-credit). The margin line banks use for trading books costs prime plus 1.5 points. See [Interbank Lending](/wiki/interbank-lending).
- **Exchange rate.** Higher rates strengthen the currency, inflation weakens it, growth strengthens it. A rate shock closes about 5% of the gap per turn, roughly 91% after 48 turns, on top of noise and trade pressure, with a final clamp of 50% below to 50% above the base rate.
- **Inflation and margins.** High rates cool borrowing and spending. Inflation changes every sector's profit margin:

\`\`\`wiki-chart
inflation-corporate-margin-effect
\`\`\`

\`\`\`wiki-chart
rate-shock-pass-through
\`\`\`

| Inflation | Margin effect |
| --- | --- |
| Below 0% | 2 points lost for each point below zero |
| 0% | +2% |
| 1% | +1% |
| 2% | 0% |
| 5% | -3% |
| 7% | -5% |
| 10% or more | -8% (cap) |

- **Corporate growth.** Revenue growth costs scale with the prime rate, so higher rates slow organic expansion.

The chair does not control fiscal policy, which needs legislation. But the two interact: deficits lift growth and can fuel inflation, which forces hikes, which raise borrowing costs. See [National Metrics](/wiki/national-metrics).

## Country differences

| Bank | Who sets the rate | What is different |
| --- | --- | --- |
| US Federal Reserve | Chair proposes, FOMC votes | Board terms, nominations by the President, Senate confirmation. The chair alone cannot move the rate. |
| Bank of England | Treasury before 1997, then the Bank | Independence is a statute, not a date. |
| Euro area | Shared central bank | One policy rate for every member. |
| Command economies | The plan | No automatic rate setter. |
| Other national banks | The seated Chair, or the government where the bank is not independent | Same move limits and scrutiny. |

## Connections

**Driven by**

- [FOMC / Rate-Setting Board](/wiki/fomc): the committee's votes set the US prime rate.
- [National Metrics](/wiki/national-metrics): inflation, growth and unemployment feed scrutiny and the rate target.
- [Planned / Command Economies](/wiki/planned-economies): a command economy switches the automatic setter off.
- [Currency Exchange](/wiki/currency-exchange): market pressure on the currency decides whether a band holds.
- [Private Banking](/wiki/private-banking): bank premiums fill the deposit insurance fund.
- [Savings & Interest](/wiki/savings-interest): central bank savings interest creates new money.
- [Line of Credit](/wiki/line-of-credit): draws create money, repayments retire it, and interest feeds bank reserves.
- [Interbank Lending](/wiki/interbank-lending): margin line draws create money and repayments retire it.
- [Confirmation Process](/wiki/confirmation-process): the Senate confirms Federal Reserve board seats.
- [Relocation](/wiki/relocation): a Central Bank Chair resigns when they change country

**Affects**

- [FOMC / Rate-Setting Board](/wiki/fomc): the move size, wait and scrutiny rules cap what the committee can do.
- [Savings & Interest](/wiki/savings-interest): the prime rate minus inflation sets the savings yield.
- [Line of Credit](/wiki/line-of-credit): prime is the base of every line's rate.
- [Interbank Lending](/wiki/interbank-lending): prime sets the central bank margin line's cost.
- [Sovereign Bonds](/wiki/sovereign-bonds): prime and scrutiny set new coupons.
- [Corporate Bonds](/wiki/corporate-bonds): prime sets the base of new coupons.
- [Currency Exchange](/wiki/currency-exchange): rates and interventions move the exchange rate.
- [Private Banking](/wiki/private-banking): the reserve requirement caps lending and insurance prices thin reserves.
- [National Metrics](/wiki/national-metrics): rates cool or heat inflation.
- [Corporations](/wiki/corporations): inflation and the prime rate move sector margins and growth costs.
- [Index Funds](/wiki/index-funds): policy rates move the price of the sovereign bonds in a fund's reserve.
- [Sovereign Default](/wiki/sovereign-default): inflation and currency falls reduce bond demand and can block the Monetize path above 8% inflation.
- [National Budget](/wiki/national-budget): the prime rate sets the coupon on new sovereign bonds.
- [Market Safeguards](/wiki/market-safeguards): rate rises lower company values, and the safeguard excuses that fall
- [Stock Market](/wiki/stock-market): The prime rate is the base of every company's cost of capital, which sets earnings power and growth premium.

## Status

Live in every world that has an active central bank. The US uses the committee, command economies run a passive bank, and the euro area shares one bank in worlds that have the euro (from 1999). Savings, lines of credit, FX intervention and money operations need the country's currency to be one of the tradable currencies, which covers the 18 main ones. The reserve requirement and insurance fund apply in worlds where private banking is open.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Every constant, formula and turn-order detail is on the [monetary system design page](https://docs.lakesidegames.net/design/monetary-system-as-shipped.html).
`;
