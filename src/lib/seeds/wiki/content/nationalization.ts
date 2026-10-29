export const nationalizationContent = `# Nationalization

Nationalization is how a government takes a private corporation, or one of its sectors, into public hands. The state pays the owners (or does not), the assets move into the country's [National Corporation](/wiki/national-corporations), and the country's investor confidence takes a hit. Later the state can sell assets back to the market, which is called privatization.

If you own a company, this page tells you when you can be taken, how long you get, and what you are paid. If you are in government, it tells you which route to use and what it costs.

\`\`\`
private corp ──(nationalize: absorb)──▶  National Corporation  ──(privatize: spin out)──▶  new private corp
\`\`\`

## How it works

A taking has four parts: a **trigger** that makes the target eligible, an **authority** that orders it, a **compensation tier** that sets the payout, and **consequences** for confidence and politics.

![Lifecycle of a nationalization: trigger, executive or legislative authority, compensation tier, absorption into the National Corporation and a privatization lockout, with investor confidence falling on each taking.](/wiki-images/diagrams/nationalization-lifecycle.svg)

### Who can be taken, and how

Unowned and computer-run (NPC) assets can be taken at any time. A **player-owned** corporation is protected. It can only be taken by one of two routes.

| Route | Who orders it | Reaches | Tiers | Notice |
| --- | --- | --- | --- | --- |
| **Executive** | Head of government, from the Nationalize tab | NPC and unowned assets, and player companies in financial distress | Discounted or Seizure | None for distress |
| **Legislative** | A nationalization bill passed by the legislature | Any corporation in the country | Fair | 48 turns |

A player company counts as **in distress** when its CEO seat has been empty for 72 turns, or it has been insolvent (negative cash) or had a defaulted bond for 72 turns. A solvent company cannot be taken by the executive. It needs a bill.

A bill-based taking is labelled by why the target qualified: sitting in a **strategic sector** (a type of business the head of government has marked strategic, up to 5 at a time), holding **75% or more** of a national sector market (a monopoly), or neither, in which case it is simply a legislative vote. Monopoly and distress takings count as popular. The others do not.

### Compensation tiers

Shareholders are paid a share of the target's value, pro rata by shares held.

| Tier | Payout | Typical route |
| --- | --- | --- |
| **Fair** | 1.0 times value | Legislative bill |
| **Discounted** | 0.5 times value | Executive |
| **Seizure** | Nothing | Executive, maximum political cost |

Value is the corporation's tangible book value: what its plants and capacity are worth, plus other assets, minus its debt. The state takes over the corporation's bonds and keeps paying coupons, so bondholders are not defaulted. The company shell is dissolved. Any cash beyond the buyout goes to the CEO, except in a seizure or when the CEO seat is vacant.

### Worked example

A company has sector plants worth 400 million, 100 million of other assets and 150 million of debt. The 150 million of debt first absorbs the 100 million of other assets and then 50 million of plant value, so **value is 350 million**.

- Legislative Fair taking: shareholders receive 350 million.
- Executive Discounted taking (distressed company): 175 million.
- Executive Seizure: nothing.

Now take the investor-confidence cost, with a neutral government and a state that owns little. A Fair taking of a strategic-sector company costs **8 points**. A Fair taking of a monopoly costs **2 points** because it is popular. A Discounted taking of a distressed company costs about **5.3 points**, and a Seizure of one costs **14 points**.

### Confidence and the cost of empire

Every country has an **investor confidence** score from 0 to 100. It heals toward **70** by 5% of the gap each turn. From 50 it is back to about 58 after 10 turns and 66 after 30. A taking pushes it down, and the push is multiplied by the **State Ownership Concentration Index** (SOCI), the share of the economy the state already owns:

- Up to **35**, takings cost the base amount.
- Above 35, the multiplier rises along a curve to 3.5 at SOCI 100. At SOCI 50 it is about 1.13.
- A statist government pays as little as half the political cost, and a market-liberal one as much as 1.5 times.

\`\`\`wiki-chart
nationalization-cost-multiplier
\`\`\`

\`\`\`wiki-chart
nationalization-confidence-recovery
\`\`\`

Low confidence is not cosmetic. Below 70 it feeds three live systems, in proportion to the gap:

| At confidence 0 | Effect |
| --- | --- |
| Private company margins | -6 points of margin (state companies exempt) |
| Government borrowing | +3 points on sovereign interest |
| New company founding cost | +25% |

At confidence 62 (8 points down) that is about -0.7 margin points, +0.3 points of interest and +2.9% to found a company.

A taking also costs the government approval and legitimacy, and the freshly taken sector suffers a **transition shock**: 15% of its revenue is deleted once, and output starts 15% down and recovers over 120 turns. Both get worse at high SOCI.

## What you can do

**As the owner of a targeted company**

1. Keep your CEO seat filled and your cash positive. An empty CEO seat or 72 turns of insolvency or a defaulted bond opens you to the executive route.
2. Watch your market share. At 75% or more in a sector market you qualify as a monopoly.
3. Check which sectors are strategic on your country page. If yours is, you are always a candidate for a bill.
4. Lobby or vote against a nationalization bill before it passes. Once it passes, a 48-turn notice starts and you get a notification. A legislative taking cannot be cancelled by changing your company. Dissolving the company before the deadline ends it, but you lose the company anyway.
5. Use the notice to prepare: shareholders can sell, and the CEO can plan.

**As head of government**

1. Open the Nationalize tab on a National Corporation page. Pick the target and, for an executive taking, the tier.
2. You can only use the executive route on a distressed or NPC target. For a solvent company, push a nationalization bill through the legislature.
3. Mark sectors strategic from the same tab, up to 5 at once. Adding one arms the strategic trigger for bills.

**As a legislator.** Vote on nationalization bills. A passed bill pays Fair, so it is the expensive, defensible option.

**As finance minister.** You run privatization from the Privatization tab. The numbers are below.

## Privatization

Privatization carves part of a National Corporation's sector into a new named corporation and floats it by IPO or auction.

| Rule | Value |
| --- | --- |
| Carve size per spin-out | 10% to 100% of the holding |
| Market cap on the new company | no more than 30% of the whole regional market |
| Golden share kept by the state | up to 40% |
| Auction bid window | 48 turns |
| Cooldown before a privatized company can be retaken | 168 turns |
| Cooldown before a newly taken sector can be privatized | 168 turns |
| Confidence gain on completion | +5 |

A National Corporation holding most of a market must therefore sell in several steps. Privatizing is the way to bring SOCI down and win back confidence, and market-leaning governments are rewarded politically for it. The privatize tab is hidden in command-economy eras, where there is no private sector to sell into.

## Connections

**Driven by**

- [Corporations](/wiki/corporations): distress, market share and sector all decide who can be taken.
- [Bills and Legislation](/wiki/bills-legislation): a passed nationalization bill orders the Fair-tier taking.
- [Cabinet](/wiki/cabinet): the head of government and finance minister hold the powers.
- [National Corporations](/wiki/national-corporations): privatizing lowers state ownership and restores confidence, making room for more takings.

**Affects**

- [National Corporations](/wiki/national-corporations): everything taken lands in the National Corporation.
- [National Budget](/wiki/national-budget): the treasury pays compensation and receives remittance.
- [Sovereign Bonds](/wiki/sovereign-bonds): low confidence raises the government's borrowing rate.
- [Government Approval](/wiki/government-approval): an unpopular taking costs approval and legitimacy.
- [Corporate Mergers](/wiki/corporate-mergers): state-owned corporations cannot be bought and are outside merger review.

## Status

Nationalization is live in every world and country with players enabled. Fair compensation is the target's tangible book value (replacement cost of its plants, plus other assets, minus debt). Worlds still on the older earnings-based economy price takings from capitalized earnings with a larger premium. The Privatization tab is not offered in command-economy eras.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact constants live in the open source repository under src/lib/nationalization/constants.ts. No design page covers nationalization yet.

See also: [Glossary](/wiki/glossary), [Corporate Mergers and Acquisitions](/wiki/corporate-mergers)
`;
