export const fundraisingAdsContent = `# Fundraising & Ads

Money is the oxygen of a campaign. This page covers how you earn campaign money, what it buys, and where it is wasted. Ads turn money into favorability, and favorability scales every vote you win, so knowing the real return on an ad action matters more than any other spending decision.

## How it works

You have two money pools. They are not interchangeable.

- **Campaign Funds:** what you spend on ads, polls, donor base, canvassing, Campaign Presence and party taxes. New characters start with ₳250,000. Every action on this page draws on this pool.
- **Cash on Hand:** your personal liquid cash. It is spent on wire transfers (Portfolio page) or donated into Campaign Funds with a Personal Campaign Donation, which keeps only 50% of it. It starts at ₳0.

If an action shows "-₳100,000", it is Campaign Funds unless the action says "personal cash".

### Where campaign funds come from

Every turn your Campaign Funds grow by three things:

| Component | Amount |
| --- | --- |
| Base rate | ₳5,000 to ₳40,000 per turn, by your home state's population tier |
| Donor bonus | Donor base level x the per-level rate for your tier |
| Office bonus | A fixed amount while you hold office |

| Tier | Home state population | Donor income per level per turn |
| --- | --- | --- |
| Small | under 2 million | ₳100 |
| Medium | 2 to 8 million | ₳200 |
| Large | 8 to 20 million | ₳400 |
| Mega | over 20 million | ₳800 |

| Office | Bonus per turn |
| --- | --- |
| US House | ₳5,000 |
| US State Senate | ₳3,000 |
| US Senate | ₳15,000 |
| US Governor | ₳15,000 |
| US Vice President | ₳25,000 |
| US President | ₳50,000 |

UK, German and Japanese offices pay an equivalent tier, with prime ministers and the chancellor at the top tier.

![Base, donor and office income flow into Campaign Funds, which are spent on ads, polls, canvassing, presence and party tax, with Cash on Hand converting at 50 percent.](/wiki-images/diagrams/fundraising-ads-money-flow.svg)

### Key numbers

| Item | Value |
| --- | --- |
| Fundraise | 3 actions, no money up front |
| Fundraise return | (₳50,000 + ₳2,000 x donor level) x (1 + state influence / 100), times your Fundraising stat modifier |
| Build Donor Network | 4 to 20 actions plus ₳3,000 + ₳1,500 x current level, scaled by state GDP per capita (0.85x to 2.0x) |
| Run Advertisements | 5 to 9 actions by favorability tier, about ₳100,000 at national-average GDP |
| Ad gain | +3 favorability up to 70, +2 from 71 to 80, +1 above 80 (neutral Charisma) |
| Targeted ad | 1 action and ₳100, +1 nominal bonus, cap 25, halves every 24 turns |
| Campaign action | 1 to 5 actions by influence tier, +1 political influence |
| Influence decay | 0.75% of current value per turn |
| Party tax | 0% to 33%, set by the party |
| Personal Campaign Donation | 2 actions, 50% of the cash reaches Campaign Funds and the other 50% is lost |
| Out-of-state action cost (Support and Attack only) | 1.0x home, 1.25x neighbour, 1.5x other. Funds cost does not change. Barnstorm has no distance cost |

### Worked example: a fundraise

A donor base level 5 character with 50% influence in a state: (₳50,000 + ₳2,000 x 5) x 1.5 = ₳90,000 for 3 actions. Fundraise is not taxed by the party, so all ₳90,000 reaches Campaign Funds. With a neutral Fundraising stat, a level 1 character with 0% influence raises ₳52,000, and a level 10 character at 100% influence raises ₳140,000. The influence multiplier runs from 1.0x at 0% to 2.0x at 100%.

### Ads and favorability

The favorability gain of one ad is floor((3 - 0.1 x (favorability - 70)) x Charisma multiplier), with the penalty only above 70, and never less than +1. A neutral Charisma gives:

| Current favorability | Gain per ad |
| --- | --- |
| Up to 70 | +3 |
| 71 to 80 | +2 |
| 81 and above | +1 |

\`\`\`wiki-chart
ad-favorability-gain
\`\`\`

Higher Charisma raises each figure and lower Charisma cuts it. Above 80 an ad is never wasted, but it is poor value: stop at your target (60 minimum, 70 optimal for most races). When you run an ad you choose a demographic group, or broad for untargeted. Targeted ads give slightly more on that group. Aim at the two or three weakest groups after a Full Poll (see [Demographics and Targeting](/wiki/demographics-targeting)).

### Targeted ads

You can also buy ads aimed at one voter group in one state. Each targeted ad takes **1 action and ₳100** and adds 1 point of nominal bonus for that group, up to a cap of 25 points, with up to 50 ads per purchase. The bonus halves every 24 turns, and what it is worth to you depends on how well your positions fit that group, in the same way as canvassing (see [Canvassing](/wiki/canvassing)). To reach the cap you need 25 ads, about ₳2,500 and 25 actions, and then top it up as it fades. For example, after buying 25 ads (bonus 25), 24 turns later the bonus is 12.5, so about 12 more ads restore it.

\`\`\`wiki-chart
targeted-ad-decay
\`\`\`

### Influence and the Campaign action

A Campaign action costs 1 to 5 actions by influence tier and adds +1 political influence. Influence decays by 0.75% of its value each turn, and if your party holds the national executive that rate is multiplied by 2 minus approval over 100 (2.0x at 0% approval, 1.5x at 50%, 1.0x at 100%). At influence 80, decay is 0.6 a turn, so about one Campaign action a turn just holds your ground. Near 100 you can stop with little loss.

### Donor network payback

Raising your donor base from level 1 to 2 costs about ₳4,500 at national-average GDP. In a medium state that earns ₳200 more per turn, so it pays back in about 23 turns, roughly one real day. In a mega state (₳800 per level) it takes about 6 turns. A level also adds ₳2,000 to every fundraise.

### The campaign page budget

Once you are a candidate your campaign page has its own budget, separate from your personal Campaign Funds: passive income by fundraising level (₳20,000 at level 0 up to ₳5,000,000 at level 10 for a presidential race, scaled for other races), upgrade costs and maintenance. If the campaign cannot cover next turn's maintenance, levels downgrade automatically. See [Campaign Strategy](/wiki/campaign-strategy) and [Campaign Manager](/wiki/campaign-manager).

### Party tax

A party can tax your per-turn fund income from 0% to 33%, set by the Chair and Treasurer. It applies to gross income: per-turn earnings x (1 - tax rate) reach you. National and regional parties can use different rates. The Fundraise action is not taxed: you keep all of it.

## What you can do

- **Fundraise** whenever you have 3 spare actions. It needs donor base level 1 or more (every character starts at 1).
- **Build Donor Network** early. It pays back quickly and permanently lifts your fundraise return.
- **Run Advertisements** to raise favorability toward your target.
- **Campaign** to hold your influence.
- **Donate** with a Personal Campaign Donation: 2 actions plus the cash you choose. Only half the cash reaches Campaign Funds and the other half is lost. It also triggers an infamy tick that grows with the size of the donation.

Tips:

1. Spend your starting actions on the first Build Donor Network, to level 2.
2. Fundraise regularly at level 2 and above.
3. Run ads only when favorability is below your target. Do not ad-spam above 75.
4. Upgrade the campaign page's fundraising level once you are a candidate.
5. Factor a high party tax (25% or more) into your per-turn income. Fundraise is untaxed, so it is the better source in a high-tax party.

Common question, "Why am I always out of funds?": the sinks are ads (about ₳100,000 each), polls and Campaign Presence, against an income of only base + donor + office per turn. Fundraising and a higher donor level are the fix.

## Connections

**Driven by**

- [Stats & Actions](/wiki/stats-actions): action costs and the Fundraising and Charisma modifiers set every figure above.
- [Political Parties](/wiki/political-parties): party tax comes out of your per-turn income, not Fundraise actions.
- [Campaign Strategy](/wiki/campaign-strategy): the fundraising upgrade levels set your campaign page's passive income.
- [Polling](/wiki/polling): the worst-groups list shows where ads pay.
- [Demographics & Targeting](/wiki/demographics-targeting): group sizes and appeal show which group to aim ads at.

**Affects**

- [Campaign Manager](/wiki/campaign-manager): campaign funds pay for upgrades and maintenance.
- [Political Operations](/wiki/political-operations): the campaign treasury pays each Campaign Presence level.
- [Canvassing](/wiki/canvassing): each canvass costs ₳100 in campaign funds.
- [Polling](/wiki/polling): polls are paid from campaign funds.
- [Election Mechanics](/wiki/election-mechanics): favorability from ads scales every vote you win.
- [first-campaign-walkthrough](/wiki/first-campaign-walkthrough): the income and ad rules behind the day-one ledger

## Status

Live in every world and country with campaigns. Office bonus tiers differ by country, and money amounts are shown in your home currency.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact formulas and constants are on the [Fundraising and Ads design page](https://docs.lakesidegames.net/design/fundraising-ads.html).
`;
