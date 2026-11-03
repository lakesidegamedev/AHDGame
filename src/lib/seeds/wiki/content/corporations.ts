export const corporationsContent = `# Corporations

The first real decision you make as CEO is which industry to commit to, because margin, tax and who you end up fighting all follow from it. A **corporation** is a business a player runs as CEO. It owns **sectors** (the plants it builds in each state), sells what they make on the commodity markets, pays tax, employs workers and pays dividends to its shareholders. It is the main way players earn money and economic influence, and it ties into most other systems: prices, labour, taxes, the stock market and politics. In a command economy the state owns production instead; see [Planned / Command Economies](/wiki/planned-economies).

## Each turn, from plants to dividends

Each turn, your plants produce goods, the goods compete for buyers at your pricing posture, and what sells becomes revenue. Margin modifiers (type match, location, state conditions, size) turn revenue into profit. Your overhead budgets and CEO salary are costs taken before tax, so profit is what remains after them; profit then pays tax, and dividends come out of what is left. What is left builds your treasury, and your treasury, plants, earnings and debt set your share price.

You grow by building plants, or by **attacking** a rival's sector to take whole plants off it. Marketing Strength decides those fights. Splitting the unowned pool only exists in worlds that have not reached the plants stage.

![The ten stages each corporation passes through every turn, from production and clearing to tax, salary and dividends, strength accrual, share orders and the vote sweep.](/wiki-images/diagrams/corporations-turn-flow.svg)

The numbers that matter most, in one place:

| Rule | Value |
| --- | --- |
| Founding fee and starting capital | ₳1,000,000 each in modern money (deflated in a 1953 world); starting treasury up to ₳50,000,000, with everything above ₳1,000,000 paid from your own cash |
| Wait before founding again | 96 turns after your last corporation ends |
| Starting shares | 10,000,000 to the CEO (scaled with era money); opening price is treasury divided by shares, ₳0.10 at the ₳1,000,000 baseline |
| IPO float | 10% to 49% of the company (75% with dual-class stock); 96-turn wait after a privatization |
| Primary / secondary / unrelated sector margin | +5 / +2.5 / -15 percentage points |
| Home state / home country bonus | +5 / +2.5 points |
| Sprawl starts above | 15 sectors at zero logistics strength (-0.5 points per 2 sectors, doubled with a secondary type); logistics strength raises the threshold |
| Changing type | -10 points for 24 turns, then a 48-turn cooldown |
| Overhead cap (marketing, logistics, R&D, salary) | 150% of daily sector revenue |
| CEO salary cap | 1.25 times daily sector revenue |
| Dividend rate | 0% to 25% of after-tax income |
| Production policy | -25 to +25, moving 1 step per turn |
| Shareholder votes | 24 turns, can end early |
| Merger review referral | 75% / 60% / 50% / 40% combined share, by the country's competition law |

### Stage by stage

Every turn, the game processes each corporation through these phases:

1. **Production.** Inputs gate throughput and capacity gates output, so what you can physically make is settled first (see [Running a Corporation under the Plants System](/wiki/plants-corp-guide))
2. **Clearing.** Your output is posted at your pricing posture and competes for real buyers: a loyal-customer share first, then cheapest first (see [Market System: A Player's Guide](/wiki/market-system-guide)). What doesn't sell doesn't earn
3. **Revenue and margin.** Realized revenue is set from what actually sold, then the effective margin applies every modifier below
4. **Capital.** Capacity depreciates, and any build orders that have come due are delivered
5. **Reputation.** [Brand loyalty](/wiki/brand-loyalty) and [output quality](/wiki/output-quality) update from this turn's pricing and delivery
6. Corporate tax bases updated in federal and state budgets, then national budget revenue refreshed for state-owned corps
7. CEO salary paid from liquid capital, then dividends distributed to shareholders
8. Marketing, logistics and R&D strengths accrue from their budgets; split escalation decays by 1
9. Pending share orders filled, share prices recomputed, market cap and per-corp history snapshotted
10. Open shareholder votes auto-resolved and closing reminders sent

## Founding a corporation

The headline founding fee is **₳1,000,000** in modern money, and the new corporation starts with **₳1,000,000** in liquid capital. A 1953 world deflates both figures to that era's money (1979, 1991 and modern worlds use the figures above), outside the US the amount is converted into local currency at the world's base exchange rate, and the founding dialog always shows the exact amount before you confirm. Low investor confidence can add up to **25%** to the fee, paid to the country treasury; the corporation's starting capital is never reduced. You can optionally raise the starting treasury as high as **₳50,000,000**; everything above the ₳1,000,000 baseline is deducted from your personal cash on top of the fee.

At founding you choose from **17 sector lines**: the 15 corporation types, plus the vehicles line of manufacturing and the entertainment line of media:

| Type | Label |
| --- | --- |
| technology | Technology |
| financial | Financial |
| energy | Energy |
| healthcare | Healthcare |
| media | Media |
| manufacturing | Manufacturing |
| retail | Retail |
| manufacturing_vehicles | Automobiles (manufacturing, vehicles line) |
| agriculture | Agriculture |
| real_estate | Real Estate |
| defense | Defense |
| telecommunications | Telecommunications |
| media_entertainment | Entertainment (media, entertainment line) |
| logistics | Logistics |
| extraction | Extraction & Mining |
| chemical_industries | Chemical Industries |
| construction | Construction |

Your chosen type is the corporation's **primary type**. Sectors matching your primary type receive a +5 percentage-point operating margin bonus. You can later add a **secondary type** for a +2.5 percentage-point bonus on sectors of that type. A sector that matches neither type takes a **-15 percentage-point mismatch penalty**, so the type choice is a real constraint on where you build.

A secondary type also **doubles the logistical sprawl penalty**. Changing your primary or secondary type costs a **-10pp margin penalty on every sector for 24 turns**, followed by a **48-turn cooldown**, so the next change is possible 72 turns later.

The CEO receives 10,000,000 shares (fewer in a 1953 world, where the share count scales with the era's money). The opening price is the starting treasury divided by those shares: ₳0.10 at the baseline treasury, more if you commit extra capital. Your corporation's HQ is set to your current home state. A CEO must live in the headquarters state, so a plain move removes the CEO seat unless the corporation moves too, which moves the headquarters and costs 7% of market cap (14% across countries). See [Relocation](/wiki/relocation).

### Legal structure

Every corporation is founded with its country's default legal form, and where a country has separate public and private forms a private founding takes the private one: a C-Corp in the United States and a KK in Japan either way, a PLC or a Ltd in the United Kingdom, an AG or a GmbH in Germany, and so on. Countries without forms of their own use a general corporation. The form sets tax treatment and shareholder rights.

- **Standard forms** pay company tax, then shareholders pay tax on dividends.
- **Preferential forms** (a German SE, a Brazilian Ltda, and China's SOE form for state-owned companies) pay company tax at a reduced rate.
- **Pass-through forms** pay no company tax. Owners are taxed on their full share of profit every turn, whether or not it is distributed. Some are taxed as companies instead: a Japanese GK, any pass-through whose shares trade publicly, and an S-Corp with more than 100 holders or any holder that is not an individual. US S-Corps are capped at 100 individual holders and must pay out at least 20% of profit; LLCs and UK LLPs carry their own minimum payouts.
- A listed-only form cannot be worn by a private corporation, and a private-only form cannot be worn by a public one.
- A private corporation's CEO changes the legal structure directly; a public corporation needs a shareholder vote. Either way, a change starts a 48-turn cooldown.

### Founding checklist

Before you confirm the dialog:

- [ ] You have the full fee in personal cash, not campaign funds.
- [ ] You chose the type you actually intend to build in. Off-type sectors lose 15 margin points.
- [ ] You understand that a secondary type doubles sprawl, and that changing it later costs the same 24-turn margin penalty and cooldown as changing your primary type.
- [ ] You chose private or public deliberately. A public IPO brings cash but dilutes control.
- [ ] You know your HQ state, because home-state sectors get the location bonus.

![The Found a Corporation dialog, showing the founding fee, private or public choice, name, ticker, primary sector, secondary sector, and starting treasury](/static/wiki/plants-corp-guide/found-corporation.png)

*The founding dialog. The fee and treasury are shown in the world's local currency. This screenshot is from a 1953 world, so the dollar figure is era-scaled; your world shows its own amount.*

### Where you cannot found one

In a command economy the state owns production outright and **private corporations cannot be founded at all**. The block follows each country's marketization level, not a fixed list. It covers the USSR, Ukraine, Belarus and the Baltics, East Germany, Poland, Hungary, Czechoslovakia, Bulgaria and Romania until their market transitions, China until 1978, and Yugoslavia until 1964. Once a country reaches dual-track reform, private founding opens. Their producing base is a stack of state-owned enterprises run through the national plan, with directors appointed by the state rather than founders. See [Planned / Command Economies](/wiki/planned-economies).

### Public vs private corporations

When you found a corporation, you choose between two structures:

- **Private**: you own 100% of shares. Other players still see the name, headquarters, sectors, shareholder list, credit rating and each sector's profit. Your treasury, income, budgets, dividend rate, share price, and per-sector revenue, margins, workforce and plant output are **not** visible to non-CEO viewers.
- **Public IPO**: additional shares are offered to the public float at the same per-share price as your founding commitment. The equity market buys what it can fund straight away and places the rest gradually over later turns; the cash reaches your treasury as shares are placed. You keep your founder shares (10,000,000) but your ownership share drops as the new shares are placed.

A single-class float is capped at 49% so a founder keeps majority ownership; dual-class stock (below) allows up to 75%. After founding, a private corporation can also IPO later via the **Go Public** action in the CEO panel, as long as it has no minority shareholders and 96 turns have passed since any earlier privatization. Founding private does not start a cooldown.

You found a manufacturing corporation with a ₳1,000,000 fee and ₳1,000,000 of capital. You hold 10,000,000 shares at ₳0.10. You go public with a 25% float: the game offers 10,000,000 x 25 / 75 = 3,333,333 new shares, which raise about ₳333,333 for the treasury and leave you with 75% of the company once all of them are placed.

### Dual-class supershares

A founder may adopt dual-class stock at IPO or later through a
shareholder vote. The chosen multiplier is an integer
from 2x to 10x. Supershares receive the same dividends and buyout value as
common shares; only governance voting power changes.

Supershares never transfer. A buyer always receives common stock. If the
founder sells below the number of supershares originally marked, their
effective supershare count falls with the remaining holding. It never rises above
the number originally marked, but buying shares back restores it up to that number
unless the founder sold out completely. A dual-class IPO may float up to 75%
instead of the normal 49% because voting control is measured separately from
economic ownership.

Shareholder votes and privatization eligibility use voting power. Cash payouts
remain per share, so supervoting control does not increase the founder's
economic claim.

### Privatization buyouts

A CEO who controls more than 75% of a public corporation's **voting power** can call a privatization vote. Dual-class supershares count toward this, so a founder with voting control can privatize even if their economic stake is lower. The vote runs for 24 turns. Eligible voters are non-CEO character and corporation shareholders; the public float doesn't vote (no person owns it) but auto-tenders if the vote passes.

- Buyout price = current share price × 1.10 (10% premium), locked at vote-open time
- Vote passes on simple majority of voting power actually cast (abstentions don't count; supershares count for their extra votes)
- On pass: every non-CEO shareholder is bought out at the locked price; the public float is retired and the corp's treasury receives the equivalent payment; the CEO ends up with 100% of (now-reduced) total shares; the corporation becomes private
- On fail: the CEO's reserved cash is refunded and a 96-turn cooldown applies before another vote can be called
- While a vote is open, the CEO cannot issue new shares, run a stock split, or change the dividend rate
- Cross-currency privatization (CEO home currency ≠ corp currency) is currently blocked

### Shareholder governance votes

Public corporations use shareholder votes for legal structure changes, HQ relocation, dissolution, public share issuance, ticker changes, adopting dual-class stock, and CEO pay rises above the share of net income a CEO can award themselves. The CEO opens the vote from the corporation page, and each shareholder's ballot is weighted by the number of shares they control.

Votes run for 24 turns but can finish early once the result is mathematically certain:

- If yes shares reach the required threshold, the vote passes immediately.
- If the remaining unvoted shares can no longer make yes reach the threshold, the vote fails immediately.
- If neither side is certain, the vote resolves at the deadline.

The turn processor sweeps open corporation votes every turn, so passed or failed votes finalize even if nobody opens the vote page. Passed share-issuance votes add the shares the equity market can fund straight away to public float and credit their proceeds to corporate liquid capital; the rest of the approved shares are placed gradually over later turns.

### What happens to plants that leave a corporation

When a corporation abandons a sector, dissolves (by the CEO, a shareholder vote, bond default, or insolvency), or liquidates sectors in a bond restructure, its plants do not simply shut. An NPP operator in the same industry takes over about three quarters of each plant's built capacity: one already running that industry in the same region if there is one, otherwise one elsewhere in the same country, otherwise a new NPP corporation. The rest of the capacity closes, and that share of the market reopens to anyone who builds into it.

Unfinished construction is not handed over. It is refunded and cancelled exactly as before. Payouts to the leaving corporation and its shareholders are unchanged. Extraction concessions and defence contracts move with the plants that hold them. Losing or selling a sector also cuts your [brand loyalty](/wiki/brand-loyalty).

### Subsidiaries and control groups

You can control more corporations than the one you run directly. A corporation counts as your **subsidiary** when your corporation controls more than **50% of its voting power** and you formalize the relationship. The subsidiary keeps its own CEO, cash, and shares. The parent can inject capital (up to 25% of parent liquid capital per injection, with a 24-turn cooldown), set a dividend floor, appoint its CEO, and spin off sectors into a new wholly owned company.

Spin-offs cost a base fee plus a per-sector fee and have a **168-turn cooldown**. A group cannot chain subsidiaries, a formalized subsidiary cannot issue equity, and a subsidiary must be run by someone other than the parent's owner, either another player or an NPP caretaker. See [Subsidiary Corporations](/wiki/subsidiary-corporations). Share ownership and voting power decide who controls whom, and a merge deletes the target and moves its sectors and cash to the buyer (see [Corporate Mergers & Acquisitions](/wiki/corporate-mergers)); a group shares tax relief and strength.

A **control group** is wider than the formal subsidiary list: it is every corporation your corporation controls through more than 50% of the votes, directly or down a chain, whether or not the relationship is formalized. Merger concentration and breakup cases read the whole control group, and so do management overhead and the dominance toll once the world switches group size costs on, so splitting a business into shells does not hide its size.

## Putting plants in a market

Corporations grow by acquiring **sectors** in state economies. A sector is not an abstract slice of a market: it **is the plants you own** in that state. The capacity is the real asset, and the revenue figure you see is derived from what that capacity actually produces and sells.

### Founding a sector

Entering a new state and industry is a **first build**, and it costs two things:

| Charge | What it is |
| --- | --- |
| Entry fee | Land, permits and licences. Scaled to your world's era money, so a 1953 permit is priced in 1953 money rather than modern money. Tech-tree expansion discounts reduce it. |
| Starter build | **One facility**, charged at a tenth of the base build price, where every later build pays 80% of it. Getting your first plant into a market is deliberately cheap; everything you build after it is not. Worlds that start in 1991 are the exception: there the first plant pays the full base price. |

The capacity **arrives**; it does not appear. A new sector starts at zero capacity with the starter order sitting in its build queue, and it comes online in half the industry's base build time because a greenfield plant is scoped to its site from day one. Later builds in heavy industry (a base time of 72 turns or more: energy, extraction, chemicals, manufacturing, vehicles and defence) are halved too, so there the first plant takes as long as any other build. Until the order lands, the sector produces nothing.

You may build a sector in any industry. Primary and secondary industries affect
the margin bonus; they do not gate which plants you can found.

### Market capture (splits)

Splitting the unowned pool is a pre-plants action. Once a world reaches the plants stage the game refuses it, and you grow a sector by building capacity. In a world before plants, once you operate in a state you can "split" the unowned pool there to take market share out of it:

| Parameter | Value |
| --- | --- |
| Cash cost | 5% of the unowned pool |
| MS cost | 2^escalation, so 1, 2, 4, 8, 16... |
| Capture | 5% of the pool × 1.25 unowned bonus × (1 + MS ÷ 100) |
| Escalation decay | Falls by 1 each turn, halving the cost back toward 1 MS |

Tariffs cut a foreign company's capture, by up to half at a 100% tariff. Choosing half strength halves the cash cost, the MS cost (minimum 1) and the capture.

Rapid splits get expensive fast, but waiting a few turns resets the cost.

### Attacking rivals

Under plants you attack a rival with a **sector split**: an attempt to take whole plants off its sector in a state. You do not choose the size. Marketing Strength sets both how much is at stake and whether you win:

| Part | Rule |
| --- | --- |
| Plants at stake | 1% of the defender's plants at equal or weaker MS, rising in a straight line to **20%** when your MS is twice theirs. Rounded down, at least one plant, and the defender always keeps one |
| Odds | Your MS ÷ (your MS + their MS), held between 5% and 95% |
| Cash cost | Half the book value of the plants at stake |
| MS cost | 2 × log2(defender's plants + 1), rounded up before doubling |

The defender needs at least two plants, and state-owned or suspended corporations cannot be attacked. Cash and MS are spent whether the split lands or not. On a win the plants move to you whole, into your sector in that state or a new one.

Worlds that have not reached the plants stage have no player attack. Computer-run corporations there use an older contested formula that moves revenue one for one, with two multipliers that keep entrenched monopolies breakable:

| Multiplier | Effect |
| --- | --- |
| **Dominance ease** | 1.0× at or below 50% market share, ramping to **3.5×** at 100%. The tighter a defender's grip on a state's sector, the softer it is to hit. |
| **Underdog bonus** | Up to **1.75×** for an attacker below 10% share striking a defender above 50%. It tapers away and is gone by 25% attacker share. |

\`\`\`wiki-chart
dominance-and-underdog-attack
\`\`\`

Say you later attack a rival with 40 plants carrying ₳40 million of book value. You have 60 Marketing Strength against its 40, a 1.5 to 1 edge, which is halfway to the 2 to 1 cap: the stake is 1% + 0.5 x 19% = **10.5%** of 40 plants, rounded down to **4 plants**. Those plants carry ₳4 million of book value, so the attempt costs **₳2 million** and 2 x 6 = **12 MS**. Your odds are 60 / (60 + 40) = **60%**. Win and the 4 plants are yours; lose and the cash and MS are gone anyway.

**A split is a gamble, not a discount.** A win buys working plants at half their book value, but every failed roll is money and Marketing Strength spent for nothing. What you are buying is a rival's position and a chance at it.

Non-player corporations raid too, with the same sector split. An aggressive NPP-run corporation picks whichever rival in its own markets gives it the best expected capture, waits out a 24-turn cooldown between strikes, and holds a small MS reserve back. A player-run company it hits is safe from further computer raids for 72 turns. A corporation sitting on low Marketing Strength reads to that logic as a soft target.

Computer-run (NPP) CEOs also run the operator loop a player would: wages (quality hangs off that), same-country [supply agreements](/wiki/supply-agreements), extraction [prospecting](/wiki/resources-overview) against short deposits, and parking idle treasury in high-coupon [bonds](/wiki/corporate-bonds) instead of letting cash sit.

## Reading a sector's numbers

### Two clocks

Two different clocks run in this game. Mixing them up is the most common source of confusion about sector economics.

- **One turn is one hour.**
- **One financial day is 24 turns.** Every money figure is a daily rate: revenue, maintenance, wages, growth cost, profit.
- **One game year is 48 turns.** Growth rates are per game year. A game year is two financial days.

So an "annual" money figure is **2x** the daily figure, not 365x. That is correct, not a bug.

### From nameplate to net profit

Under plants a sector row shows one revenue, and its tooltip walks the chain from capacity to produced, sold, revenue, effective margin, operating profit, net profit and net margin. Worlds before plants show the older chain below. Its terms still explain where plants revenue comes from, and only realized revenue drives your profit.

| Step | What it is |
| --- | --- |
| Nameplate revenue | What the plants you own could produce at list prices: capacity × price |
| Realization | Production policy, commodity prices, throughput and capacity applied to that nameplate |
| Realized revenue | What the sector actually earned. **Profit is computed from this** |
| Operating profit | Realized revenue minus total operating cost |
| Effective margin | Capped display output derived from the realized profit basis |
| Net profit | The plants P&L result after revenue and all recorded costs |

Nameplate revenue is **derived from the capacity you own**, so it does not compound on its own. Output grows when you build, and not otherwise. Revenue that moves without new plant is realization and clearing at work, not growth.

Realization can go **up** as well as down. If your output clears at a price premium, realized revenue is above nameplate and your profit is higher than nameplate x margin.

Commodity prices reach your bottom line by two separate routes. They move your **effective margin** through the commodity modifier, and they move your **realized revenue** through price realization. That is why changing a commodity price does not move your margin alone.

### What growth costs

A growth rate is a percentage per game year. Its cost is charged every financial day.

Because a game year is two financial days, you pay the daily growth cost twice for each game year of growth. The total price of the revenue you add is the growth cost multiplier (currently 3x), adjusted up or down by the prime rate, your CEO's Business Acumen and any market dominance. Set growth to 0% to stop the charge entirely. Under plants the growth rate is retired: the turn sets it to 0 and the controls are hidden, so you add output by building capacity.

### Unowned headroom

In worlds that have not reached the plants stage, the unowned pool grows at half the average owned-sector growth rate, with a 1% fallback. Once plants are in play, unowned headroom grows with the state's GDP growth instead.

This means unowned market share regenerates over time. Before plants, a sector you partially captured will refill, so sustained expansion requires repeated splits. Under plants the headroom is unmet demand: it stops growing in a recession rather than shrinking, and you grow into it by building capacity.

## What moves your margin

If a margin is negative, open the sector's margin breakdown and check, in order: commodity input costs, sector type match, size costs, and state conditions such as power grid or corruption. Many factors adjust your sector profit margins. These are additive:

| Modifier | Max Effect | Notes |
| --- | --- | --- |
| Sector type match | +5pp primary / +2.5pp secondary / -15pp unrelated | Bonus if sector matches primary type; penalty if neither type matches |
| Secondary type match | +2.5pp | If sector matches secondary type |
| Home state | +5% | Sectors in your HQ state |
| Same country | +2.5% | Sectors in your home country (not HQ state) |
| State conditions | ±8pp combined | Every tracked state metric, among them unemployment, power grid, corruption, workforce skill, crime, broadband, roads, carbon emissions and cost of living, weighted by how much your sector and its strategy rely on it. Each metric is capped at 0.75pp and each cost channel (labour, logistics, grid and so on) at 2pp |
| Inflation | +2% to -8% | Bonus between 0% and 2%, penalty above 2% and in deflation |
| Debt-to-GDP | up to -5% | Penalty starts at 50% D/GDP |
| Deficit stimulus | up to +5% | +0.5% per 1% of GDP deficit |
| Subsidies | +7.5% per subsidy | Federal and state stack |
| Logistical sprawl | -0.5%/2 sectors (-1%/2 with a secondary type) | Penalty above 15 sectors; see Logistical Sprawl below |
| Type switch penalty | -10% | Active for 24 turns after switching primary or secondary type; you cannot switch again until 72 turns after the switch |
| Strategy transition | -5% | Active during the 12-turn window when changing operating strategy |
| Tariff (foreign corp) | -(rate / 2)% | If your corp HQ is abroad; the rate adds up economy-wide, sector, origin-country and company tariffs, and a free trade agreement removes it |
| Tariff (domestic malus) | up to -10% | Economy-wide and sector tariffs create friction for domestic corps |
| Commodity input costs | ±50pp per commodity, -30pp in total | Logarithmic; shortages in inputs you consume compress margins. Inputs and outputs together cannot take more than 15pp |
| Commodity output demand | ±50pp per commodity, +30pp in total | Logarithmic; shortages in commodities you sell boost margins |
| Dominance margin penalty | up to -15% | Scales from 0 at ≤50% market share to -15pp at 100% share. Under plants it fades out unless the world runs a dominance running cost; dominance is charged on build prices instead |
| Dominance regulatory burden | up to 5% of revenue | Compliance/antitrust cost; scales with market share above 50%. Before plants only |
| Combined size cost cap | -7.5pp | Sprawl, management overhead, and dominance are capped together, each scaled down proportionally |
| Sustained negative production | up to -45% | Builds after 48 turns of negative production policy; full penalty at 144 turns |
| Sovereign default | Varies | For 72 turns after a default (48 at full strength, 24 fading), scaled by the resolution chosen and by sector; companies abroad feel a smaller share |
| Nationalized (SOE efficiency) | 0% to -25% | Government-owned corporations only; dynamic penalty from corruption, governance quality, price-control/employment-guarantee mandates, and state-holding overreach |

Sectors that don't match your primary or secondary type receive a **-15% penalty**. Focused corporations outperform diversified ones unless you manage logistics carefully.

### Size costs

Being big is not a free multiplier. Three charges price size. Sprawl counts the company's own sectors; management overhead and the dominance running cost read your whole **control group** when the world switches group size costs on:

- **Logistical sprawl:** sectors above 15 cost margin, and a secondary type doubles the slope.
- **Management overhead:** a plant-count charge when the world enables it.
- **Dominance:** under plants, mainly a build-price toll. Above 50% of a state's sector (or 30% of the country's), new capacity costs more, up to 3x at 100% share. The margin penalty of up to -15pp stays only if the world runs a dominance running cost, and the compliance burden of up to 5% of revenue applies only before plants.

The three margin charges are capped at **7.5 points combined**, scaled down proportionally when they would exceed the cap. A dominant company still pays for its position, but size alone cannot zero out its margin.

The other ceiling is legal. Competition law can refer a merger, order a divestiture, or break up a dominant group. A Subsidiary Limits Act caps how many companies one group may run, and a Foreign Investment Act can screen or cap foreign-controlled ownership. The thresholds are in [Bills & Legislation](/wiki/bills-legislation#the-three-economic-laws).


### The wider game

State GDP growth is driven by your sectors. Before the plants stage it is the revenue-weighted average of the state's corporate sector growth rates, with unowned sectors counted at 0.5%. Once plants are in play it follows what the state's sectors actually sell and produce, after inflation. The rest of the game feeds back into your sectors in return.

**Prices and trade.** [Commodities](/wiki/commodities) markets affect margins: steel shortages hurt manufacturing, oversupply in energy compresses energy sector margins. [Household demand](/wiki/household-economy) is the end market for consumer sectors, and [freight limits and shipping bills](/wiki/logistics-guide) change sector revenue and margin; if profit collapsed after you added a plant, check the sector's Freight tag and its sold percentage first. Seeded sector markets and specialties (see [Game Starting State](/wiki/game-starting-state)) are what corporations compete for. [Tariffs](/wiki/tariffs) change foreign and domestic sector margins and market share fights, and [Embargoes & Trade Exposure](/wiki/embargo-and-trade-exposure) cut sector revenue, maintenance and margin for exposed foreign operations. A trip of [Market Safeguards](/wiki/market-safeguards) changes how sector revenue is computed, and company earnings set the fundamentals it compares against. Capacity squeezes set what extraction sectors can earn (see [Resources](/wiki/resources-overview)); an extraction corporation with operations in a state can bid for an [extraction contract](/wiki/extraction-contracts), and R&D breakthroughs and surveys raise state resource capacity. A defence contract pays the supplier its margin, and domestic defence plants bid for and fill defence orders (see [Defence Procurement](/wiki/defence-procurement)).

**Money and the state.** [Central Banks](/wiki/central-banks) set the prime rate that moves build prices and growth costs, and steer the inflation that moves sector margins, and state conditions and inflation shift profit margins through [National Metrics](/wiki/national-metrics), where sector output and staffing drive GDP growth and unemployment in return. Debt-to-GDP drags margins, while deficits and [subsidies](/wiki/subsidies) lift them (see [National Budget](/wiki/national-budget)); sector revenue sets what a subsidy costs the government, and corporate profits and sales are the base for corporate and sales tax, so profitable corps help state finances. High national debt cuts every corporation's margin there and deficits add a stimulus ([Sovereign Bonds](/wiki/sovereign-bonds)). Companies headquartered in a defaulting country take a margin penalty for up to 72 turns, full for 48 and fading over 24, scaled by how the default is resolved and by sector ([Sovereign Default](/wiki/sovereign-default)); an IMF bailout ([IMF Sovereign Facility](/wiki/imf-sovereign-facility)) carries the mildest of those penalties. Disasters cut profit margins for sectors in the affected region ([Crisis Interaction](/wiki/crisis-interaction)), and responses to [World Events](/wiki/world-events) shift sector demand, which changes sector revenue for 3 to 24 turns. Legislation ([Bills & Legislation](/wiki/bills-legislation)) creates subsidies (+7.5% margin) and tariffs that directly affect margins, and tax rate changes that affect after-tax profit, and senators and Representatives can advance bills that benefit their sector.

**People and cash.** The wage level you set feeds national wages and unemployment (see [Labour & Wages](/wiki/labour-and-wages)) and, with union-busting choices, changes unionization ([Unions](/wiki/unions)); union strength and strikes change labour cost and output. Pension contributions and top-ups are a recurring cash cost for the employer ([Pensions](/wiki/pensions)). A CEO's company rating, salary and dividends feed the line of credit score and limit, and a frozen line redirects CEO salary and dividends to the loan ([Line of Credit](/wiki/line-of-credit)). Running a corporation makes you eligible for CEO events ([Player Random Events](/wiki/player-events)).

**Ownership.** Under [Corporate IMF Restructuring](/wiki/imf), CEO salary and dividends stop while the rescue runs, and company income sets how much of each rescue payment can be collected. [Nationalization & National Corporations](/wiki/nationalization) lets distress, market share and sector decide who can be taken. Corporation share prices and dividends drive the funds that hold them, and a fund's votes can decide shareholder votes while its sponsor earns fee revenue ([Index Funds](/wiki/index-funds)).

## The CEO's desk

### National influence

Running a large listed corporation builds a small national name. Only listed corporations in the top half of their country by market cap qualify. Once the corporation you run as CEO has qualified for **12 turns** in a row, you earn national influence each turn:

| Corporation | National influence per turn |
| --- | ---: |
| One of the 10 largest listed corporations in its country by market cap (and in the top half) | +0.3 |
| Any other listed corporation in the top half of its country by market cap | +0.15 |

Private corporations and listed ones in the bottom half earn nothing. This is a position tier, so it does not stack with an office: if you also hold a seat, you get the higher of the two. Being a CEO grants no extra actions.

### CEO salary

Set a daily salary from zero up to 1.25x the corporation's daily gross sector
revenue. A corporation with zero revenue has a zero salary cap. Salary is
deducted from liquid capital each turn, so high salaries drain capital and
reduce share price over time.

### Overhead cap

Combined daily spending on marketing, logistics, R&D, and CEO salary cannot exceed **150% of total daily sector revenue**. The game rejects budget updates that would push overhead past this limit.

### Marketing budget and Marketing Strength

Marketing Strength (MS) is your corporation's **economic-warfare currency**. It is not a sales stat: it does not raise demand, clear more of your output, improve your margin, or move your share price. What it decides is who takes market share from whom.

MS grows each turn from what you actually **spend on delivered advertising**, not from the budget you set. Your marketing budget is placed as advertising demand with the media and entertainment sectors, you pay only for the advertising that fills, unfilled budget stays in your treasury, and it is the delivered spend that feeds MS. When advertising fills only part of what is asked for, strength accrues more slowly than the budget figure suggests. A budget you cannot fund next turn places no demand at all.

- Base: 1 MS per turn (any delivered spend at all)
- Scaled: grows with the log of delivered spend
- Diminishing returns on stored MS, doubling above MS 100

Starting MS is 10, and it has three uses:

| Use | How it works |
| --- | --- |
| **Offence** | When you split a rival's plants, 1% of their plants are at stake if your MS equals theirs, rising to 20% when yours is twice theirs. Your MS also sets your odds |
| **Defence** | A split succeeds with chance attacker MS ÷ (attacker MS + defender MS), held between 5% and 95%. A defender holding 150 MS gives a 50 MS raider a 25% chance, with only the 1% baseline at stake |
| **Ammunition** | Every split attempt spends MS whether it succeeds or not, more against a rival with more plants. Run out and you cannot act at all |

**Marketing Strength decays every turn.** Where marketing decay applies, which includes current worlds, it loses **1.5% per turn**, on top of what you spend on splits and attacks. Logistics strength bleeds 5% a turn and R&D score 3%. A budget that only replaces what you spend is not enough; it has to cover decay too. Group synergy, when enabled, is a **transfer** from the group leader rather than free strength, so a group shares strength instead of minting it.

\`\`\`wiki-chart
marketing-strength-over-time
\`\`\`

Marketing spend buys you nothing if nobody is attacking you and you have no intention of splitting or attacking, and it still counts against the 150% overhead cap.

**Marketing Strength is not brand loyalty.** Loyalty is a separate reputation earned through consistent pricing and delivery, and no amount of marketing spend contributes to it. See [Brand Loyalty](/wiki/brand-loyalty).

### Logistical sprawl

Corporations with more than **15 sectors** incur a -0.5% margin penalty per 2 sectors over the threshold. With a secondary type set, that doubles to -1.0% per 2 sectors. Logistics & Operations (your distribution reach and operational process quality) spending raises the threshold with no upper limit (30 sectors at Logistics & Operations Strength 200, 45 at 400) and flattens the penalty slope, down to half at strength 200 and above.

\`\`\`wiki-chart
logistical-sprawl-penalty
\`\`\`

Logistics sectors (depots) never pay the sprawl penalty on their own margin. They still count toward the sector total, so adding depots raises the penalty on every other sector you own.

### Research, tech trees & wages

**Tech tab:** Every corporation has a **Tech** tab with decade-tiered research nodes. Each decade offers a **Corporate** lane (shared business upgrades) and a **Sector** lane (specialist unlocks for your primary type). Nodes cost **R&D Score + cash** and can gate advanced operating strategies. See [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d) for lane commitment, prerequisites, and effects.

**R&D budget:** Daily R&D spend builds an **R&D Score** (log-scaled, 3% decay) used for tech unlocks and periodic innovation breakthroughs every 6 turns. R&D counts against the 150% overhead cap.

Your Average Quality is built from your research, wages, inputs and operations (see [Output Quality](/wiki/output-quality)).

**Wage level:** When the labour system is enabled, each sector exposes a **wage slider** (default 1.0) that moves explicit labour cost without changing baseline outcomes at default. Minimum-wage legislation can floor low-pay sectors. See [Labour & Wages](/wiki/labour-and-wages).

### Supply agreements

You sign and settle contracts from your corporation page. See [Supply Agreements](/wiki/supply-agreements).

### Production policy

Each sector has a production policy on a **-25 to +25 scale**. The active level trends toward your target at 1 unit per turn. It multiplies revenue, commodity output (supply), and commodity input consumption (demand) asymmetrically:

| Level | Revenue | Commodity output | Commodity input consumption |
| --- | --- | --- | --- |
| **+25** (Aggressive) | +10% | +15% | +10% |
| **+10** | +4% | +6% | +4% |
| **0** (Neutral) | baseline | baseline | baseline |
| **-10** | -2% | -4% | -6% |
| **-25** (Conservative) | -5% | -10% | -15% |

Aggressive policy maximizes revenue and commodity throughput but also raises input costs. Conservative policy protects margins by sharply cutting input consumption while accepting reduced output, but only for a while: after 48 turns below zero a margin penalty starts, growing to -45 points at 144 turns. It stops as soon as the level is back at zero or above. The asymmetry is intentional: at maximum conservation, input reduction (-15%) outpaces output reduction (-10%) because lean operations waste less.

### Autopilot

Your corporation's Overview has an **Autopilot** switch. You stay CEO and can still act by hand. Each turn, while it is on, autopilot sets the marketing, logistics and R&D budgets and the dividend, grows plants that are selling, and opens new plants when there is spare cash. It can also reduce active capacity at a demand-limited plant that is losing money, then restore it when buyers return or production constraints clear. The plant and its paid capacity remain yours. Budgets and dividends you set by hand are reset each turn, unless you tell autopilot to leave them alone under **What the NPP may do** on the same card. Autopilot may also adjust active capacity at eligible plants, so a hand-set level there may change next turn.

Autopilot reinvests slowly. Each turn it commits at most 15% of the cash above the corporation's reserve to new capacity, adds at most 5% to any one plant, and keeps only one growth order in flight per plant. It builds only where the plant made a profit last turn, runs at 85% or more of its capacity, the market has room for more, the corporation's earnings are positive, and the extra output should repay the build within 30 turns of coming online. Turning it on asks you to confirm, and the Overview shows what it may spend, with a button to turn it off.

By default it never borrows, picks research, retools, sells or closes plants, or buys rivals. **What the NPP may do** lets you pick an attitude (Growth, Cost cutter, Advise only) or set each action yourself, including allowing it to sell or close plants, which removes them with no sale proceeds. When one of those is worth doing, it lists it on the Overview, and urgent items also arrive in your inbox. A corporation on autopilot is not penalised for an inactive CEO, but its CEO's national influence is capped at the standard rate rather than the higher top-listed-company rate. Appointing an NPP caretaker switches autopilot off.

![Corporation overview with the Autopilot switch, Simple and Pro toggle and key statistics](/wiki-images/screens/corporations-autopilot-overview.webp)

### Simple and Pro views

A corporation's Overview tab has a **Simple / Pro** switch in its top right corner, and the same choice sits in Settings under Appearance. It is saved to your account and follows you to every company. **Pro** is the full detailed view and the default, except that a phone opens on Simple until you choose. **Simple** shows what needs your attention, the core figures at a glance (revenue, net income, net margin, growth, cash, debt with its leverage rating, share price and how much of your output sold) and your five biggest sectors by revenue.

## Operating strategies

Each sector type has **4 to 8 operating strategies** that change which commodities it supplies and demands. Strategies are how you specialize: an energy sector can run Conventional (fossil fuels), Renewables Focus (solar/wind using electronics and rare earth), Nuclear Expansion (high output, heavy steel and chemicals), and several more besides. A chemical industries sector can pivot between industrial chemicals, fertilizer production, pharmaceuticals, or plastics.

**Strategies have no flat margin bonus**: their value comes mostly from commodity market dynamics. Each strategy also weights how much local conditions such as grid reliability, broadband or workforce skill move its margin, capped at 8 points in total. Switching to a strategy that supplies a scarce commodity or avoids expensive inputs can dramatically improve margins; switching into an oversupplied market does the opposite.

### Switching strategies

| Parameter | Value |
| --- | --- |
| Initiation cost | 25% of sector daily revenue |
| Transition duration | 12 turns (rates interpolate linearly) |
| Transition margin penalty | Progressive −5% over 12 turns (starts at 0%, reaches full −5% at completion) |
| Cooldown | 24 turns from initiation, running alongside the 12-turn transition, before another switch is allowed |

Retooling onto a strategy that supplies a raw resource in a global shortage (supply below half of demand) costs nothing and takes 6 turns instead of 12. During the transition, commodity flows blend from the old strategy toward the new one. The penalty represents retooling disruption. You can see a before/after comparison of estimated margin impact in the sector detail panel before confirming a switch.

Computer-run corporations may automatically retool a sector onto a better strategy when prices squeeze the current recipe. That pass never runs on a corporation you run yourself. Autopilot leaves retooling to you unless you allow it under **What the NPP may do**, and an NPP caretaker may retool unless you forbid it there.

### Strategy overview by sector type

| Sector | Strategies | Count |
| --- | --- | --- |
| Energy | Hydraulic Fracturing, Conventional, Renewables Focus, Nuclear Expansion, Smart Grid, Fusion Generation | 6 |
| Manufacturing | Additive Manufacturing, Autonomous Factory, Standard, Heavy Metals, Electronics Manufacturing, Vehicle Assembly, Trucks and Heavy Machinery | 7 |
| Technology | Quantum Computing, AI Platforms, Standard, Hardware Focus, Software Focus | 5 |
| Agriculture | Vertical Farming, Precision Agriculture, Traditional, Industrial, Sustainable | 5 |
| Chemical Industries | Specialty Chemicals, Industrial Chemicals, Fertilizer Production, Pharmaceuticals, Plastics & Polymers | 5 |
| Healthcare | Telehealth Network, Standard, Hospital Networks, Outpatient & Preventive | 4 |
| Manufacturing (vehicles) | Autonomous Vehicles, Standard, EV Focus, Heavy Machinery | 4 |
| Financial | Algorithmic Trading, Standard, Fintech, Traditional Banking | 4 |
| Media | Streaming Media, Standard, Digital-First, Legacy Broadcast | 4 |
| Defense | Directed-Energy Systems, Standard, Cyber Warfare, Heavy Armor, Munitions & Arms Export, Naval Systems, Missile & Rocket Systems, Aerospace Systems | 8 |
| Real Estate | PropTech Platforms, Standard, Commercial Development, Green Building | 4 |
| Construction | Modular Construction, General Contracting, Infrastructure Buildout, plus a research-gated Factory-built Modular Construction method from 2019 | 4 |
| Telecommunications | 5G / 6G Networks, Standard, Wireline Network, 5G/Infrastructure, Cloud Services | 5 |
| Media (entertainment) | Live-Service Platforms, Standard, Streaming/Digital, Live/Venue | 4 |
| Retail | E-Commerce Fulfillment, Standard, E-Commerce, Brick & Mortar | 4 |
| Logistics | Autonomous Freight, Standard, Freight Only, Automated Logistics, Full-Service | 5 |
| Extraction & Mining | Diversified, Iron & Metals Mining, Oil & Gas, Rare Earth Minerals Mining, Coal Mining, Timber & Forestry | 6 |

There is no separate Copper Mining strategy: copper was merged into the Rare Earth Minerals commodity, and Rare Earth Minerals Mining covers both markets.

For extraction sectors specifically, the **Diversified** strategy spreads output across all six resource types (copper is merged into the Rare Earth Minerals market) at lower per-commodity rates. The focused strategies (Iron & Metals Mining, Oil & Gas, etc.) produce roughly **3 to 5×** more of their target commodity (Timber & Forestry about 20× the timber, while Oil & Gas makes under twice the natural gas), so switching to the focused strategy that matches the scarcest resource is almost always the higher-margin play when a clear shortage exists. See [Commodities](/wiki/commodities#extraction-strategies) for a full breakdown.

**Telecommunications** sectors produce **Network Services** (subscription-equivalent broadband/connectivity capacity) as their primary unique output alongside software. The five strategies (Standard, Wireline Network, 5G/Infrastructure, Cloud Services and the research-gated 5G / 6G Networks) differ in how much network services versus software they supply and in their hardware and energy input mix. Network services have background macro demand from GDP, so there is always a market even before player-built Telecom sectors are common.

## Corporate taxes

Foreign income and HQ relocations convert at the spot rate (see [Currency Exchange](/wiki/currency-exchange)). Two tax rates apply to each sector: a **domestic rate** and a **foreign rate**. A corporation headquartered in the US pays the US domestic rate on US sectors and the foreign rate of any other country where it operates. Both rates are set by legislation in each country. State-level corporate taxes also stack on top.

### Pass-through companies

An LLC, S-Corp, LLP, Irish Unlimited Company or Nigerian Unlimited Liability Company pays no company tax. Instead, its owners are taxed on their **full share of the profit every turn, whether it is paid out or not**, the way real pass-through taxation works. The company pays this owner tax for them at the headquarters country's and state's rates: the top personal income rate for shares held by people, and the corporate rate for shares held by companies, NPPs and funds. Payouts from a pass-through are then not taxed again.

Some forms are taxed as ordinary companies instead:

- A pass-through whose **shares trade publicly** (any public float).
- An **S-Corp with more than 100 holders, or any holder that is not a person**.
- A Japanese **Godo Kaisha (GK)**, which is a company for tax purposes.

This change phases in over 24 turns from its start, so the tax rises step by step.

### Balance sheet and financing

A corporation's share price is anchored to tangible book, so the balance sheet is not cosmetic. Construction in progress counts as an asset, and any construction loan that paid for it counts as debt. Overdrawn cash counts as a negative, not as zero. A company that borrows to build can therefore look cheaper on earnings than a cash-rich rival while still being worth the capacity it owns.

That is deliberate. A company that reinvests earnings into capacity is worth at least what that capacity is worth, even while current profit is temporarily lower. The share price is meant to reflect the assets the company owns, not just this turn's earnings. See [Private Banking](/wiki/private-banking) for construction and corporate lending: a financial sector can charter a bank, and bank loans credit a company's liquid capital.

Bond cash funds growth, while coupons and principal drain liquid capital; your finances set your credit rating and what you can borrow (see [Corporate Bonds](/wiki/corporate-bonds)).

## Shares, dividends and share price

The CEO sets a **dividend rate** (0 to 25% of after-tax income). Dividends are paid each turn to all shareholders proportional to their share count. A higher dividend pays shareholders now but leaves less cash behind your share price. Players buy and sell shares on country stock exchanges.

Very large sell orders and new share issues are paced over several turns so they cannot crash a price in one hour. See [Stock Market](/wiki/stock-market) for how orders fill.

**Share price formula:**
The share price is computed from three fundamental components:

- **Tangible book per share** (weight 1.0): \`(liquidCapital + 0.75 × bankEquity + sectorNPV + constructionInProgress + techAssets + 0.75 × bondHoldings - bondAndConstructionLoanDebt) / totalShares\`, never below zero
- **Earnings power per share** (weight 0.5): \`riskAdjustedEarnings / costOfCapital / totalShares\`, where net bond coupon income counts at 0.75×
- **Growth premium per share** (weight 0.15): Gordon Growth Model (a formula for valuing a company based on how fast its dividends grow) terminal value using the revenue-weighted sector growth rate, capped just below the cost of capital

The three components sum to a fundamental value. The earnings parts are cut for a company living off bond coupons, and the total is discounted for a large number of subsidiaries and for a CEO holding over 65% of the shares, and lifted slightly by index fund ownership. The price can then move at most 35% a turn, except during a post-split smoothing window (2 turns after a stock split or reverse split, where it biases 70% toward the previous price to avoid instant reversion). Between turns, market sentiment and order flow adjust the traded price.

An IMF bailout active on the corporation applies a price multiplier.

## National corporations

Some corporations are government-owned (e.g., the UK NHS). These cannot be bought, taken over or attacked unless the state privatizes them. Their revenue flows through the national budget rather than to a CEO. State-owned sectors compete in the same markets as private ones (see [National Corporations](/wiki/national-corporations)).

## Merger review

When two corporations become one, the state may have a say. This applies to an agreed acquisition and to the squeeze-out that ends a hostile takeover, at the moment the two firms actually combine.

**When it applies.** Both sides must be privately owned, and the market being consolidated must be a market. A state-owned corporation on either side is out of scope: consolidating firms the state already owns is an administrative matter, not a transaction anyone approves. In a command economy the whole system is dormant for the same reason.

**What trips it.** The combined firm's share of a national industry, measured on the same basis the Market Share chart shows. The threshold comes from the country's competition law:

| Enforcement level | Referred at a combined share of |
| --- | --- |
| No enforcement | Never |
| Case-by-case review | 75% |
| Active enforcement | 60% |
| Structural enforcement | 50% |
| Open markets charter | 40% |

**Who decides.** The cabinet seat that country gives the job: the Attorney General in the United States, the Board of Trade in Britain (later Trade and Industry, later Business), and a trade, commerce, enterprise or economy ministry elsewhere. The seat has six turns.

**What they can decide.** Clear it, block it, or clear it on condition that the combined firm divests the industry that tripped the threshold. If the seat says nothing for six turns, the decision falls out of published bands: within 5 points of the threshold it clears, within 15 it clears with conditions, beyond that it is blocked. No hidden roll.

**Conditions have teeth.** A divestiture order is discharged by measurement, not by paperwork. Spinning the business into a wholly-owned subsidiary changes nothing: the same group still holds the same share of the same market. You have to sell it down until the group no longer controls it. Miss the deadline and the corporation is fined 5% of its group revenue in that industry every turn, paid to the treasury, and cannot open new acquisitions until the order is met.

**Blocked is blocked.** A blocked pairing cannot be retried. A cleared one does not need a second referral, so a hostile takeover that was referred can simply be run again once it clears.

**Breakups.** At Structural enforcement (50%) or Open markets charter (40%), the competition authority can also open a breakup case against a group whose national share in an industry is above the threshold. The case stays open for six turns. The authority can order the group to sell down, or dismiss it. A breakup order is measured on the control group, so moving the business into a subsidiary does not satisfy it.

**Foreign investment.** A Foreign Investment Act adds a second gate at the border. At level 1, new foreign-controlled subsidiaries and acquisitions need the authority's approval. At level 2 foreign-controlled groups together may hold at most a quarter of any national industry, at level 3 a tenth, and at level 4 foreign-controlled subsidiaries may not operate at all. A group outside a tightened rule has 48 turns to comply, after which its controlling stake in each offending subsidiary is sold down to half at book value.

**Subsidiary limits.** A Subsidiary Limits Act caps how many subsidiaries one group may run in the country: twelve, eight, five, or three depending on the level. A group over the limit when the law tightens has 48 turns to sell, spin off or release the newest excess subsidiaries, after which its controlling stake in each is sold down to half at book value.

## Is the company in good shape?

There is no single winning build, but a company in good shape usually clears these tests. Use them as diagnostics, not targets to game. Share price comes from tangible book, earnings power and a growth premium (see [Stock Market](/wiki/stock-market)).

| Test | Healthy sign | What to do if it fails |
| --- | --- | --- |
| Margin | Positive after tax and overhead for several turns | Check the margin breakdown before adding capacity. A commodity input or a size charge is usually the cause. |
| Fill | Most of what you produce is selling | Lower price posture, retool to a scarcer output, or stop building into a glut. |
| Cash | More than a few turns of operating cost | Cut overhead, pause growth, fundraise, or use a corporate bond only if the project pays it back. |
| Debt | Debt is tied to assets that earn | Construction debt is fine if the plant will sell; debt for losses is not. |
| Sectors | Mostly primary or secondary type | Off-type sectors lose 15 margin points. Sell them, retool, or accept them as a deliberate diversification. |
| Size | Below the dominance thresholds, or earning enough to pay for it | Above 50% of a state market or 30% of the national one, new capacity costs more to build, and any running dominance charge cuts margin. |
| Strength | Marketing, logistics, and R&D funded above decay | A budget that does not cover decay is a shrinking budget. |

Applies in every world with a private economy. In command economies such as the USSR and the Eastern Bloc, private corporations cannot be founded and production is state-owned. Founding fees and sector costs are scaled to the era's money. Merger review, breakups, foreign investment and subsidiary limits depend on each country's competition and investment laws, so check the country before planning a large acquisition; dominance charges apply everywhere. Marketing decay and the plants-stage rules apply in current worlds. Last checked 2026-10-30, version 1.18.0. Exact rules: [Corporations design page](https://docs.lakesidegames.net/design/corporations.html)
`;
