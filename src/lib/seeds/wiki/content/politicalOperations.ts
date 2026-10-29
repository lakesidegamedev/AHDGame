export const politicalOperationsContent = `# Political Operations and Campaign Presence

Every dollar in a presidential campaign treasury eventually becomes a question: which states get it? [Political Operations](/political-operations) is the page where you answer that. It puts your active campaign and its state-by-state **Campaign Presence** in one place. Presence is a level you buy in a state that raises your candidate's vote weight there, in the primary and in the general election.

## What a level buys, and what it costs

Presence belongs to a candidate, not the party. (Party organization is a separate lever that the party chair controls.) You need a live campaign that has not been archived, and every level is paid for by the campaign, never from your personal actions or personal cash. It draws on the action pool supplied by the [Campaign Manager](/wiki/campaign-manager) and on the cash you raised through [Fundraising and Ads](/wiki/fundraising-ads).

Each level in a state:

1. costs **3 campaign actions** from the campaign's own pool;
2. costs cash from the **campaign treasury**, starting at ₳250,000 for the first level and growing 35% for each level the state already has;
3. can be bought only once per state per turn. You can build in different states in the same turn.

The price compounds while the benefit flattens. That is deliberate: without it, the richest campaign could buy unlimited vote weight in every state. The ladder has no hard cap, but the 20th level in a state buys about a twelfth of what the 2nd did and costs about 220 times as much.

| Item | Value |
| --- | --- |
| Campaign actions per level | 3 |
| Cash for the first level | ₳250,000 |
| Price growth per existing level | +35% |
| Builds per state per turn | 1 |
| Level cap | None (diminishing returns) |
| Level 5 gives | 50% of the maximum bonus |
| Level 10 gives | 75% of the maximum bonus |
| Maximum bonus, primary vote weight | +25% |
| Maximum bonus, general vote weight | +15% |
| Carryover after a presidential general | 25% of each level, rounded half up |

## Walking one state up the ladder

Say you pick a single state and keep building. This is what each step costs and what it returns:

| Level bought | Cost of that level | Total spent | Primary bonus | General bonus |
| --- | --- | --- | --- | --- |
| 1 | ₳250,000 | ₳250,000 | +3.2% | +1.9% |
| 3 | ₳455,625 | ₳1,043,125 | +8.5% | +5.1% |
| 5 | ₳830,377 | ₳2,488,596 | +12.5% | +7.5% |
| 10 | ₳3,723,436 | ₳13,647,540 | +18.8% | +11.3% |
| 15 | ₳16,696,013 | about ₳63.7 million | +21.9% | +13.1% |

\`\`\`wiki-chart
campaign-presence-cost-and-bonus
\`\`\`

Going from level 5 to level 10 in one state costs about ₳11.2 million and adds 6.3 points of primary vote weight. The same money split across four fresh states at level 3 or 4 each adds more in total, as long as those states are ones that can still swing.

## Choosing where to build

You can build a level from the Political Operations hub, from the State operations hub in the [Campaign Manager](/wiki/campaign-manager), or from a state's primary page. All three charge the same price. Presence is public: opposing campaigns can see how deep your network is in each state, and you can see theirs.

A modest vote-weight change is worth the most where it flips delegates or electoral votes, so concentrate early spending in delegate-rich states and in states where [polling](/wiki/polling) shows a close race.

- Spreading shallow levels across many states is cheaper at first, but it may fail to move any decisive contest.
- Safe states and lost causes are poor places to buy level 6 and above.
- Keep campaign actions and cash in reserve for [ads and canvassing](/wiki/fundraising-ads). Presence competes with them for the same campaign budget.

The bonus lands in two places. In [primaries](/wiki/primaries) it raises your vote weight in each state by up to 25%. In [general elections](/wiki/general-elections) it raises it by up to 15%. It is one of the parts of a presidential candidate's vote weight in [Election Mechanics](/wiki/election-mechanics), and it shows up as the Campaign factor in the [Vote Factor Ledger](/wiki/vote-factor-ledger).

## After the general election

When a presidential general election resolves, every stored level falls to 25% of its old value, rounded half up. Level 1 becomes 0, level 2 becomes 1, level 6 becomes 2, level 10 becomes 3 and level 20 becomes 5. The reset applies to everyone's stored levels, whether or not you were on the ballot, and it ends your campaign for that race. A durable state network helps in later cycles, but you have to rebuild most of it.

See also: [Election Mechanics](/wiki/election-mechanics), [Political Parties](/wiki/political-parties).

Live for US characters in presidential races. Characters in other countries cannot build presence, and eras and worlds without a US presidential election have nothing for it to affect. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html)
`;
