export const politicalOperationsContent = `# Political Operations and Campaign Presence

[Political Operations](/political-operations) is the US presidential ground-game hub. It puts your active campaign and its state-by-state **Campaign Presence** on one page. Presence is a level you buy in each state that raises your candidate's vote weight there, in the primary and in the general election. It is the main thing a campaign treasury is for, so it decides where your money matters.

## How it works

Campaign Presence belongs to a candidate, not to the party. It changes that candidate's vote weight in each state. Party organization is a separate lever that the party chair controls.

Every level you buy in a state:

1. costs **3 campaign actions** from your campaign's own action pool;
2. costs cash from the **campaign treasury**, starting at ₳250,000 for the first level and growing 35% for each level the state already has;
3. can be bought only once per state per turn. You can build in different states in the same turn.

You need a live campaign (one that has not been archived). Presence is paid for by the campaign, never from your personal actions or personal cash.

The price compounds while the benefit flattens. That is deliberate: without it, the richest campaign could buy unlimited vote weight in every state. The ladder has no hard cap, but the 20th level in a state buys about a twelfth of what the 2nd did and costs about 220 times as much.

### Key numbers

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

### Worked example: building one state

| Level bought | Cost of that level | Total spent | Primary bonus | General bonus |
| --- | --- | --- | --- | --- |
| 1 | ₳250,000 | ₳250,000 | +3.2% | +1.9% |
| 3 | ₳455,625 | ₳1,043,125 | +8.5% | +5.1% |
| 5 | ₳830,377 | ₳2,488,596 | +12.5% | +7.5% |
| 10 | ₳3,723,436 | ₳13,647,540 | +18.8% | +11.3% |
| 15 | ₳16,696,013 | about ₳63.7 million | +21.9% | +13.1% |

Going from level 5 to level 10 in one state costs about ₳11.2 million and adds 6.3 points of primary vote weight. The same money split across four fresh states at level 3 or 4 each adds more in total, as long as those states are ones that can still swing.

### Carryover after a presidential general election

When a presidential general election resolves, every stored level falls to 25% of its old value, rounded half up. Level 1 becomes 0, level 2 becomes 1, level 6 becomes 2, level 10 becomes 3 and level 20 becomes 5. The reset applies to everyone's stored levels, whether or not you were on the ballot, and it ends your campaign for that race. A durable state network helps in later cycles, but you have to rebuild most of it.

## What you can do

- **Build a level** in a state from the Political Operations hub, or from the State operations hub in the [Campaign Manager](/wiki/campaign-manager), or from a state's primary page. All three charge the same price.
- **Scout the field.** Presence is public: opposing campaigns can see how deep your network is in each state, and you can see theirs.
- **Choose states by value.** Concentrate early spending in delegate-rich states and in states where [polling](/wiki/polling) shows a close race. A modest vote-weight change is worth the most where it flips delegates or electoral votes.

Tips:

- Spreading shallow levels across many states is cheaper at first, but it may fail to move any decisive contest.
- Safe states and lost causes are poor places to buy level 6 and above.
- Keep campaign actions and cash in reserve for [ads and canvassing](/wiki/fundraising-ads). Presence competes with them for the same campaign budget.

## Connections

**Driven by**

- [Campaign Manager](/wiki/campaign-manager): supplies the campaign action pool that pays the 3 actions per level.
- [Fundraising and Ads](/wiki/fundraising-ads): the money you raise is what pays the cash cost of each level.
- [General Elections](/wiki/general-elections): resolving a presidential general cuts every stored level to 25%.

**Affects**

- [Primaries](/wiki/primaries): raises your vote weight in each primary state by up to 25%.
- [General Elections](/wiki/general-elections): raises your vote weight in each state by up to 15%.
- [Election Mechanics](/wiki/election-mechanics): presence is one of the parts of a presidential candidate's vote weight.
- [Vote Factor Ledger](/wiki/vote-factor-ledger): presence shows up in the Campaign factor.

## Status

Live for US characters in presidential races. Characters in other countries cannot build presence. Eras and worlds without a US presidential election have nothing for it to affect.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact cost ladder, bonus curve and reset rules are on the [Elections design page](https://docs.lakesidegames.net/design/elections.html).

See also: [Election Mechanics](/wiki/election-mechanics), [Political Parties](/wiki/political-parties).
`;
