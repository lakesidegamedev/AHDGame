export const fundraisingAdsContent = `# Fundraising & Ads

Ads turn money into favorability, and favorability scales every vote you win, so the real return on an ad action matters more than any other spending decision you make. This page covers how you earn campaign money, what it buys, and where it is wasted. The numbers behind each figure come from action costs and the Fundraising and Charisma modifiers in [Stats & Actions](/wiki/stats-actions).

## Two pools of money

You have two money pools. They are not interchangeable.

- **Campaign Funds:** what you spend on ads, polls, donor base, canvassing, Campaign Presence and party taxes. New characters start with ₳250,000. Every action on this page draws on this pool. It also pays for upgrades and maintenance in the [Campaign Manager](/wiki/campaign-manager), each Campaign Presence level in [Political Operations](/wiki/political-operations), each ₳100 canvass in [Canvassing](/wiki/canvassing), and every [Polling](/wiki/polling) action.
- **Cash on Hand:** your personal liquid cash. Among other things it is spent on wire transfers (Portfolio page) or donated into Campaign Funds with a Personal Campaign Donation, which keeps only 50% of it. It starts at ₳1,000,000, ₳2,500,000 or ₳5,000,000 by the wealth background you pick (plus ₳500,000 if you were referred).

If an action shows "-₳100,000", it is Campaign Funds unless the action says "personal cash".

### Where campaign funds come from

Every turn your Campaign Funds grow by three things:

| Component | Amount |
| --- | --- |
| Base rate | ₳5,000 to ₳40,000 per turn, by your home state's population tier |
| Donor bonus | Donor base level x the per-level rate for your tier, times (1 + your political influence / 100) |
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

Base rate and donor bonus are also scaled by your home state's GDP per capita against the national average (0.9x to 1.5x); the office bonus is not. UK and German offices pay an equivalent tier (MPs and Bundestag members ₳5,000, Minister-Presidents ₳15,000, Landtag members ₳3,000, the Chancellor ₳50,000), any Prime Minister earns ₳50,000, and offices not listed, including Japanese Diet seats, pay no office bonus.

![Base, donor and office income flow into Campaign Funds, which are spent on ads, polls, canvassing, presence and party tax, with Cash on Hand converting at 50 percent.](/wiki-images/diagrams/fundraising-ads-money-flow.svg)

### Costs and returns

| Item | Value |
| --- | --- |
| Fundraise | 3 actions, no money up front |
| Fundraise return | (₳50,000 + ₳2,000 x donor level) x (1 + state influence / 100), times your Fundraising stat modifier |
| Build Donor Network | 4 to 20 actions plus ₳3,000 + ₳1,500 x current level, scaled by state GDP per capita (0.85x to 2.0x), rounded to the nearest ₳1,000 and cheaper with a higher Fundraising stat |
| Run Advertisements | 5 to 9 actions by favorability tier, ₳100,000 below 30 favorability rising to ₳180,000 at 85 and above, at national-average GDP |
| Ad gain | +3 favorability up to 70, +2 from 71 to 80, +1 above 80 (at a 1.0x Charisma multiplier) |
| Targeted ad | 1 action and ₳100, +1 nominal bonus, cap 25, halves every 24 turns |
| Campaign action | 1 to 5 actions by influence tier, +1 political influence, less above 50 |
| Influence decay | 0.75% of current value per turn |
| Party tax | 0% to 33% each from the national party and the state party, both deducted |
| Personal Campaign Donation | 2 actions, 50% of the cash reaches Campaign Funds and the other 50% is lost |
| Out-of-state action cost (Support and Attack only) | 1.0x home, 1.25x neighbour, 1.5x other. Funds cost does not change. Barnstorm has no distance cost |

### A fundraise in practice

Take a donor base level 5 character with 50% influence in a state: (₳50,000 + ₳2,000 x 5) x 1.5 = ₳90,000 for 3 actions. Fundraise is not taxed by the party, so all ₳90,000 reaches Campaign Funds. With a neutral Fundraising stat, a level 1 character with 0% influence raises ₳52,000, and a level 10 character at 100% influence raises ₳140,000. The influence multiplier runs from 1.0x at 0% to 2.0x at 100%.

### Ads and favorability

The favorability gain of one ad is floor((3 - 0.1 x (favorability - 70)) x Charisma multiplier), with the penalty only above 70, and never less than +1. A 1.0x multiplier gives:

| Current favorability | Gain per ad |
| --- | --- |
| Up to 70 | +3 |
| 71 to 80 | +2 |
| 81 and above | +1 |

\`\`\`wiki-chart
ad-favorability-gain
\`\`\`

Because the result is rounded down, Charisma 5 or lower (a multiplier just under 1.0x) gives only +2 even below 70, and high Charisma keeps the bigger gains a few points further above 70. Above 80 an ad is never wasted, but it is poor value: stop at your target (60 minimum, 70 optimal for most races). Run Advertisements is untargeted: it raises your favorability everywhere. To work one voter group, buy targeted ads (below) aimed at the two or three weakest groups after a Full Poll; the worst-groups list in [Polling](/wiki/polling) shows where ads pay, and group sizes and appeal in [Demographics and Targeting](/wiki/demographics-targeting) show which one to aim at. The favorability that ads buy scales every vote you win in [Election Mechanics](/wiki/election-mechanics).

### Targeted ads

You can also buy ads aimed at one voter group in one state. Each targeted ad takes **1 action and ₳100** and adds 1 point of nominal bonus for that group, up to a cap of 25 points, with up to 50 ads per purchase. The bonus halves every 24 turns, and what it is worth to you depends on how well your positions fit that group, in the same way as canvassing (see [Canvassing](/wiki/canvassing)). To reach the cap you need 25 ads, about ₳2,500 and 25 actions, and then top it up as it fades. For example, after buying 25 ads (bonus 25), 24 turns later the bonus is 12.5, so 13 more ads restore it.

\`\`\`wiki-chart
targeted-ad-decay
\`\`\`

### Influence and the Campaign action

A Campaign action costs 1 to 5 actions by influence tier and adds +1 political influence, reduced by 1/75 for every point above 50 (never below +0.1), scaled by your stats. Influence decays by 0.75% of its value each turn, and if your party holds the national executive that rate is multiplied by 2 minus approval over 100 (2.0x at 0% approval, 1.5x at 50%, 1.0x at 100%). At influence 80, decay is 0.6 a turn and a Campaign action adds about 0.6, so about one Campaign action a turn just holds your ground. Higher up, decay grows and each action adds less, so influence near 100 slides back toward 80 unless you keep campaigning.

### Donor network payback

Raising your donor base from level 1 to 2 costs about ₳5,000 at national-average GDP. In a medium state that earns at least ₳200 more per turn, so it pays back in about 25 turns, roughly one real day, and faster with political influence. In a mega state (₳800 per level) it takes about 6 turns. A level also adds ₳2,000 to every fundraise.

### The campaign page budget

Once you are a candidate your campaign page has its own budget, separate from your personal Campaign Funds: passive income by fundraising level (₳20,000 at level 0 up to ₳5,000,000 at level 10 for a presidential race, scaled for other races), upgrade costs and maintenance. If the campaign cannot cover next turn's maintenance, levels downgrade automatically. The fundraising upgrade levels in [Campaign Strategy](/wiki/campaign-strategy) set that passive income, and the [Campaign Manager](/wiki/campaign-manager) is where you buy them.

### Party tax

A party ([Political Parties](/wiki/political-parties)) can tax your per-turn fund income from 0% to 33%. The national rate is set by the party Chair, Vice Chair or Treasurer, and each state party sets its own rate through its Chair, Vice Chair or Treasurer (or the national Chair). Both apply to gross income: per-turn earnings x (1 - national rate - state rate) reach you. Independents pay no party tax. The Fundraise action is not taxed: you keep all of it.

## Spending it well

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

Common question, "Why am I always out of funds?": the sinks are ads (₳100,000 to ₳180,000 each), polls and Campaign Presence, against an income of only base + donor + office per turn. Fundraising and a higher donor level are the fix. If you are new, the income and ad rules behind the day-one ledger are in the [first campaign walkthrough](/wiki/first-campaign-walkthrough).

Live in every world and country with campaigns. Office bonus tiers differ by country, and money amounts are shown in your home currency. Last checked 2026-10-30, version 1.18.0. Exact rules: [Fundraising and Ads (design)](https://docs.lakesidegames.net/design/fundraising-ads.html)
`;
