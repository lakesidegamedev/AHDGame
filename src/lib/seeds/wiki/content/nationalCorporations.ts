export const nationalCorporationsContent = `# National Corporations

A **National Corporation** is the state's own company. It holds everything the government has taken into public hands and runs it to deliver public services, back strategic industry and send profit to the national budget. It has no shareholders and cannot go bankrupt: if it loses money, the treasury covers the loss.

This page covers running one. For how a government takes a company in the first place, and for selling assets back, see [Nationalization](/wiki/nationalization).

## How it works

Every country has **one primary** National Corporation. It holds every sector type that has not been carved out. A **split-off** is an extra National Corporation that owns exactly one sector type, such as a state rail or energy company. When the state takes an asset, it goes to the National Corporation that owns that sector type, or to the primary if none does.

Three seats share control, so no one player runs everything:

- **Head of government.** Marks strategic sectors and orders takings.
- **Finance minister** (Treasury Secretary, Chancellor, Minister of Finance and similar). Sets policy: appoints or removes the CEO, sets public mandates, splits and merges sector types, sets the CEO's draw cap, and privatizes. If this seat is empty, those actions are unavailable until it is filled.
- **CEO.** Runs day-to-day operations. The finance minister appoints the CEO (they may appoint themselves). The CEO must live in the country and cannot be CEO of any other company.

The ministry sets policy and the CEO runs operations. A CEO cannot set mandates, take or sell assets, or raise their own budget cap.

### Money flow

Each turn, the corporation's operating profit is split in two. The CEO chooses how much to keep, from **0% to 75%** (the default is 0%, so everything is sent on). At least **25%** always goes to the national budget. When there is a loss, the treasury covers it and the corporation's cash returns to zero. A loss-making state company is therefore a real, ongoing drain on the budget.

The CEO can also pull cash from the budget into the company, up to a per-turn cap that the finance minister sets. The default cap is 10 million in local currency. A cap of 0 freezes draws completely.

### Worked example: one turn

A National Corporation earns 100 in operating profit, and the CEO has set retention to 40%.

- 40 stays in the corporation as working cash, and 60 goes to the national budget.
- Next turn the sector loses 20. The treasury pays 20, and the corporation's cash is set back to zero. The budget is 20 worse off.
- The CEO wants to fund a capacity expansion costing 30 and the draw cap is 25. They can draw at most 25 from the budget this turn and pay the other 5 from retained cash.

### Efficiency: governance matters

A clean state company runs like a private one. Its margin drag comes from four things, each in percentage points:

| Source | Effect |
| --- | --- |
| Corruption | up to -10 (at corruption 100) |
| Government transparency | up to +7 back (at transparency 100) |
| Price-controlled mandate | -6 |
| Employment-guaranteed mandate | -4 |
| Oversized state sector | -3 times (multiplier - 1), only above SOCI 35 |

The total is held between 0 and -25, so there is never a bonus. A state with corruption 40 and transparency 50 loses 4 and regains 3.5, a drag of 0.5. Add a price-controlled mandate and it is 6.5. A corrupt state (corruption 80, transparency 30) with both mandates and SOCI 80 is at -19.5.

## What you can do

### Public mandates

The point of owning a company, rather than taxing a private one, is the **mandate**. Each turn a state sector nudges the national metric it is matched to, slowly and durably.

| Sector type | What it improves |
| --- | --- |
| Healthcare | Physician capacity |
| Energy | Power-grid reliability |
| Logistics, vehicles, construction | Road condition |
| Telecommunications, technology | Broadband access |
| Agriculture | Food security |
| Manufacturing, chemicals | Manufacturing competitiveness |
| Defense | Public trust (Germany: Bundeswehr readiness) |
| Financial | Small-business formation, and lower income inequality |
| Retail | Lower cost of living |
| Real estate | Housing affordability |

At full state ownership of a sector in a region the nudge is **0.03 points per turn**, about 1.4 points a year before the metric's natural slow decay. It scales down with the state's share. No single sector can push a metric more than 8 points above its current level.

Two postures trade profit for public value, set for the whole company or per sector:

- **Price-controlled.** The nudge is 1.5 times stronger (0.045 per turn) at a cost of 6 margin points.
- **Employment-guaranteed.** Unemployment falls by the same 0.03 per turn at a cost of 4 margin points.

### The CEO's levers (Operations tab)

| Lever | What it does |
| --- | --- |
| Capacity investment | Grow a sector's output, revenue, remittance and jobs. |
| Modernization (R&D) | Build innovation momentum. Full funding is 3% of sector revenue per turn. The momentum lapses to 0 in 48 turns without funding and climbs to full in 8 turns. |
| Production target | Set an output target per sector. The sector drifts toward it. |
| Treasury draw | Pull budget cash into the corporation, up to the cap. |

There is no marketing and no market bond issuance, since neither fits a state company.

### Restructuring

The finance ministry can **split off** a sector type into a new named National Corporation, or **merge** one back into the primary. No money changes hands. Only one National Corporation may own a given sector type in a country. Splitting gives a strategic industry its own CEO, mandate and books.

### First-turn checklist

**New finance minister:**

1. Appoint a CEO, or yourself.
2. Set the draw cap. Zero if you do not trust the CEO yet.
3. Check each sector's mandate. Decide where price control or guaranteed employment is worth the margin.
4. Look at the Register tab for SOCI and investor confidence before ordering more takings.

**New CEO:**

1. Open Operations and see which sectors are growing and which are idle.
2. Set retention. At 0 everything goes to the budget. Raise it (up to 75%) if you plan to invest from your own cash instead of drawing on the budget.
3. Fund capacity in your best-margin sectors first.
4. Set R&D only if you can sustain 3% of revenue.

## The cost of empire

Two gauges on the **Register** tab show how far the state has gone:

- **SOCI (State Ownership Concentration Index), 0 to 100.** The share of the economy the state owns, weighted by revenue. At **35 or less** it does nothing. Above 35, every new taking costs more political capital, hits confidence harder and takes longer to absorb, up to 3.5 times at 100. A sprawling state sector also runs less efficiently.
- **Investor confidence, 0 to 100,** which heals toward 70 by 5% of the gap each turn.

To reduce SOCI, sell assets back to the market with privatization (finance minister, Privatization tab) or let the private sector grow. Selling raises investor confidence by 5. Details are on [Nationalization](/wiki/nationalization).

## Connections

**Driven by**

- [Nationalization](/wiki/nationalization): every taking adds sectors and, with them, SOCI and political cost.
- [National Metrics](/wiki/national-metrics): corruption and transparency set how efficient state companies are.
- [Cabinet](/wiki/cabinet): the head of government and finance minister hold the powers.

**Affects**

- [Nationalization](/wiki/nationalization): privatizing lowers SOCI and restores confidence, making room for more takings.
- [National Budget](/wiki/national-budget): profit remits in, losses and draws flow out.
- [National Metrics](/wiki/national-metrics): public mandates push the matched metrics up each turn.
- [Corporations](/wiki/corporations): state-owned sectors compete in the same markets as private ones.

## Status

Live in every world and era with players enabled. The Privatization tab is not available in command-economy eras. Overview, Public Mandates, Holdings and Register are visible to everyone. Operations is for the seated CEO only, Nationalize for the head of government and Privatization for the finance minister.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact constants live in the open source repository under src/lib/nationalization/constants.ts. No design page covers National Corporations yet.

See also: [Glossary](/wiki/glossary), [Sovereign Bonds](/wiki/sovereign-bonds)
`;
