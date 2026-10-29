export const sovereignDefaultContent = `# Sovereign Default

A sovereign default is what happens when investors stop buying a country's bonds. After three failed yearly bond auctions in a row, the country enters a debt crisis. Its leader must pick one of four ways out, the legislature must approve it, and everyone who holds that country's bonds or does business there feels the result: bondholders take losses, companies lose profit margin, and the leader loses standing.

If you hold sovereign bonds, run a company in a heavily indebted country, or sit in a legislature, this page tells you what to watch for and what each way out costs you.

## How it works

Once a year, when the country's budget year closes, its government bonds are tested against investor demand. The game scores demand as a **demand ratio**: 1.0 means investors bought everything on offer, 0.5 means they bought half of what was needed. If the last primary bond auction was only partly filled, the demand ratio cannot be higher than that fill rate.

\`\`\`wiki-chart
sovereign-default-demand-curve
\`\`\`

| Demand ratio | Result | What it means |
| --- | --- | --- |
| 1.0 or more | Subscribed | Healthy. The failure count resets to 0. |
| 0.7 up to 1.0 | Undersubscribed | Warning. The failure count resets to 0, but the country is flagged. |
| Under 0.7 | Failed | The failure count goes up by 1. |

Demand starts at a base of 1.2 and is pushed down by high debt, high inflation, a falling currency, a recent default and low trust. A coupon (the interest rate the country pays) above the 4% global benchmark pushes it back up, and so do bonds already held by banks and funds, up to a cap. The exact formula is on the technical page.

**Worked example.** Country A has debt at 120% of GDP, inflation of 8%, a stable currency, trust of 0.4 and a 5% coupon. Base 1.2, minus 0.18 for debt above 60% of GDP, minus 0.06 for inflation above 5%, minus 0.04 for low trust, plus 0.05 for the coupon premium gives a demand ratio of 0.97. That is undersubscribed: a warning, not a failure.

Country B has debt at 240% of GDP, inflation of 12%, a currency that fell 20% over 10 turns, trust of 0.3 and the same coupon. The sum is 0.03. That is a failed auction, and two more in a row start the crisis.

### The crisis

After the third failure in a row the country goes into crisis. The clocks then run in turns:

1. The head of government has **12 turns** to pick a resolution. If they do nothing, the game picks Repudiate for them.
2. In most countries the lower chamber of the legislature then has **24 turns** to vote on it, and the upper chamber gets another **24 turns**. Each chamber passes it with a simple majority. A tie, or no votes, counts as a rejection.
3. If either chamber rejects it, the country is Repudiated automatically. If the proposal passes, it takes effect.

Why a forced outcome? A crisis cannot be left open: bondholders, banks and companies all need to know where the losses land.

## The four resolutions

| Resolution | Bonds | Leader pays | Market lockout |
| --- | --- | --- | --- |
| **Repudiate** | All sovereign bonds marked in default. They trade at 5% of face value. | Favorability -20, infamy +15, a no-confidence vote in parliamentary countries | 48 turns |
| **Restructure** | 40% haircut and 60 extra turns on maturity. Bonds trade at 60% of face value. | Favorability -8, infamy +5 | 16 turns |
| **IMF bailout** | Bonds untouched. Debt is covered by an [IMF loan](/wiki/imf-sovereign-facility). | Favorability -10, infamy +5 | None |
| **Monetize** | Bonds untouched. The central bank prints the money. | Favorability -15, infamy +10, a no-confidence vote in parliamentary countries | None |

Each resolution also posts civil-unrest news events (3 for Repudiate, 2 for Monetize, 1 each for Restructure and the bailout). The lockout is how long the country cannot sell new bonds. Monetize cannot be chosen once inflation is above 8%, and if inflation climbs past 8% while the legislature is still voting, the country falls back to Repudiate.

Monetize prints the financing gap (bonds maturing within 12 turns plus the yearly deficit). Inflation rises by the printed amount divided by GDP, times 5, and the currency falls by 40% of that fraction. A gap of 9 billion on a GDP of 300 billion is 3% of GDP, so inflation jumps 15 points and the currency drops 6%.

Repudiate and Restructure also record a GDP penalty (Repudiate 12% over 3 turns, Restructure 6% over 2). The IMF bailout and Monetize have none. The penalty shows on the country's recovery panel. The long-term damage comes mostly from the effects below.

## What a default does to you

**If you hold the country's bonds.** Repudiate is the worst case. Your bonds trade at 5% of face value, so you lose about 95%. Restructure costs you 40% of face value and your money is tied up 60 turns longer. Under an IMF bailout or Monetize your bonds are not marked down. Monetize hurts you through inflation instead.

**If you own a company there.** Companies headquartered in the defaulting country take a profit margin penalty for 48 turns at full strength, then it fades over 24 more turns. At full strength it is -18 points of margin for Repudiate, -9 for Restructure and -4.5 for an IMF bailout, multiplied by the sector. Financial firms take 1.5 times, manufacturing, retail, real estate, construction and chemicals 1.3 times, technology, health, media, logistics and defense 1.0 times, and energy, extraction and agriculture only 0.7 times. Foreign companies feel a smaller version, scaled by the defaulting country's share of world GDP and halved.

**If you run a bank or fund.** Losses can cascade. If a sovereign write-down wipes out a major bondholder, its own creditors are tested, and so on for up to 3 levels.

**If you are the leader.** The favorability and infamy costs above are charged to the character who proposed the resolution.

## The scar and recovery

Every resolution leaves a **scar**. It lowers the country's bond demand ratio by 1.0 right after the default, and the penalty shrinks by 0.01 each turn, reaching zero after 100 turns. It makes new auctions harder but does not directly reduce GDP.

\`\`\`wiki-chart
sovereign-default-scar-decay
\`\`\`

The country is in **recovery** for at least 48 turns. It ends only after the country has also run 5 disciplined fiscal turns in a row. A clean exit earns a small reward: 0.5 points off the country's bond interest rate for 100 turns.

| Key number | Value |
| --- | --- |
| Failed auctions to trigger a crisis | 3 in a row |
| Failed auction | Demand ratio under 0.7 |
| Executive decision window | 12 turns |
| Vote window | 24 turns per chamber |
| Monetize blocked | Inflation above 8% |
| Repudiate lockout, margin penalty | 48 turns, -18 points |
| Restructure lockout, margin penalty | 16 turns, -9 points |
| Scar length | 100 turns |
| Minimum recovery | 48 turns plus 5 disciplined turns |
| Bailout margin penalty | -4.5 points |

## What you can do

- **Head of government.** Submit a resolution from the Sovereign debt crisis panel on your country page. Act inside the 12 turns, because silence means Repudiate. Restructure and the IMF bailout are the gentlest on companies and leaders. Monetize only works while inflation is 8% or lower.
- **Legislators.** Vote on the proposal in your chamber. Remember that a rejection or a tie means Repudiate, the harshest result.
- **Bondholders.** Watch the Sovereign Debt Watch panel on the world crises page. It scores countries and shows their failed-auction streak. Once a country is in crisis the damage is set by the resolution, so the time to cut exposure is while the streak is still short.
- **Company owners.** If your country is at risk, expect a 72-turn margin hit and plan your cash for it.
- **Anyone.** Keep debt under 60% of GDP, inflation under 5%, and offer a coupon above the benchmark to keep demand healthy.

## Connections

**Driven by**

- [Sovereign Bonds](/wiki/sovereign-bonds): the yearly auctions and the bonds being held set the demand ratio.
- [National Budget](/wiki/national-budget): deficits and debt as a share of GDP push demand down.
- [Central Banks](/wiki/central-banks): inflation and the currency's fall feed straight into demand.
- [Bills and Legislation](/wiki/bills-legislation): chamber votes decide whether a resolution passes.
- [IMF Sovereign Facility](/wiki/imf-sovereign-facility): taking the bailout sets the recovery clock and avoids the lockout.

**Affects**

- [IMF Sovereign Facility](/wiki/imf-sovereign-facility): the bailout path creates the loan.
- [Sovereign Bonds](/wiki/sovereign-bonds): defaults, haircuts and the lockout change what bonds are worth and when new ones can be sold.
- [Corporations](/wiki/corporations): companies in the country take a margin penalty, and bondholding firms can fail.
- [National Budget](/wiki/national-budget): debt is written down, credit rating drops, and the market is closed for a while.

## Status

Sovereign default applies to every country where players are enabled, in every world and era. Countries still marked Coming Soon cannot default. Fully autonomous worlds can default a non-player country, but only if its debt is at 200% of GDP or more.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The full demand formula, every constant and the turn order are on the [Sovereign Bonds design page](https://docs.lakesidegames.net/design/sovereign-bonds.html).

See also: [Glossary](/wiki/glossary), [Corporate Bonds](/wiki/corporate-bonds), [Corporate IMF Restructuring](/wiki/imf)
`;
