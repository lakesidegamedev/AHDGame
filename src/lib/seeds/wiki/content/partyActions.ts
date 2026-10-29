export const partyActionsContent = `# Party actions

A party has its own money and its own power, separate from yours. Its leaders use them to grow organization, boost turnout, manage NPPs and decide who runs. This page covers the three party resources, the Major and Minor tiers that cap them, and every action leaders can take.

## How it works

### The three resources

**Treasury.** Money from member taxes (see [Party Membership](/wiki/party-membership)). A national treasurer sets the national rate and a state treasurer the state rate, each from 0% to 33% of members' income. Treasury pays for Build Org clicks, budgets and NPP work.

**Political Strength (PS).** The reserve spent on party actions, mainly [Build Org](/wiki/party-organization). It comes from two streams: a flat trickle of **20 PS per turn** for a national party and **5 PS per turn** for a state party, and an optional treasury investment the chair sets, which buys up to **20 PS per turn** (in the US, ₳12,500 per PS nationally and ₳6,250 per PS for a state). Stock stops at the **cap**; extra is lost.

**NPP Action Points.** A separate pool for managing NPPs, spent only on NPP work.

Spending PS in one state makes the next spend there dearer by 1 PS, up to 8, and the extra falls by 3 each turn. Other states are unaffected.

### Major and Minor parties

Every party is **Major** or **Minor**, shown as a badge on its page. The tier sets the PS cap.

- New custom parties are Minor. Their national PS cap is **100, plus 10 for each region where they hold at least 20% Org**, and never above the Major cap.
- A Minor party that reaches **20% Org in a third of a country's regions** becomes Major (a quarter in the UK, which means 3 of 12). In the US that is 17 of 50 states.
- A Major party that falls **below 10% Org in two thirds of regions** gets a warning and a countdown. If it has not recovered after **240 turns** it drops to Minor.
- The historic governing parties start Major. In one-party states the ruling party is always Major.

### Key numbers

| Item | Value |
| --- | --- |
| Passive PS per turn | 20 national, 5 state |
| Treasury-bought PS | Up to 20 per turn |
| National PS cap | 280 (Major); 100 + 10 per earned region (Minor) |
| State PS cap | 30 (7.5 if the state party has no player members) |
| Ladder: extra PS cost per spend in one state | +1, up to a cost of 8; falls 3 per turn |
| Region earned / lost | At 20% Org / below 10% Org |
| Demotion grace | 240 turns |
| NPP Action Points: cap | National 160 Major / 80 Minor; state 40 Major / 20 Minor |
| NPP Action Points: regained per turn | National 16 / 8; state 4 / 3 |
| Cost of one NPP management action | 1 NPP Action Point plus a treasury fee |
| Cost to recruit an NPP | 5 NPP Action Points plus ₳50,000 (US) |
| Budget percentages (GOTV, suppression, registration) | 0% to 25% of revenue each |

## Budgets

Budgets are set once as a percentage of the party's income and then run every turn. The chair, vice chair or treasurer sets them; the national chair can too.

- **GOTV (Get Out The Vote).** Raises turnout of one voter group you pick (a category such as age, or a group within it). A better organized party gets more turnout per ₳.
- **Suppression.** Lowers turnout of a voter group in the opposition's base. A built-in party with no active human chair takes half of this; see [Party Leadership & Authority](/wiki/party-leadership-authority).
- **Registration drive.** Moves a few voters from the independent pool toward your party, at most **0.1 percentage points per state per turn**. Registration also drifts toward your Org on its own, slowly.
- If the treasury goes negative, all budgets pause until it recovers.
- The old Org-building budget is gone. Build Org is now a click that costs PS and money.

## NPP actions

| Action | Who | Cost | Effect |
| --- | --- | --- | --- |
| Boost Favorability or Political Influence | National or state chair, vice chair, campaigner | 1 NPP Action Point plus a fee (₳5,000 in the US) | Raises that stat on a same-party NPP; always succeeds |
| Strengthen Loyalty or Improve Cooperation | Same | 1 NPP Action Point plus a fee (₳12,500 in the US) | Raises loyalty or lowers stubbornness; always succeeds |
| Relocate an NPP | National leaders | 1 NPP Action Point | Moves the NPP to another home state |
| Recruit an NPP | Chair or vice chair, national or state | 5 NPP Action Points plus ₳50,000 (US) | Creates a new party NPP, within the party's NPP capacity |
| Slate | National or state chair and vice chair | No cost | Assigns a same-party NPP or player to a race |
| Whip | See [Party Leadership](/wiki/party-leadership) | Free | Directs NPPs on bills and leadership votes |

**Slate: getting NPPs to run.** Assign a same-party NPP to a race on the Slate board. The NPP accepts if its loyalty is at least 40 and its stubbornness is at most 70. State and regional leaders get 5 points of leeway on each. The board shows "Likely to Accept" or "Likely to Decline" before the turn, then "Accepted" or "Declined" after. NPP entry is covered in [NPP Elections](/wiki/npp-elections).

**State legislature NPPs.** NPPs do vote on state and regional bills, and state chairs and vice chairs can whip them. See [NPP Behavior](/wiki/npp-behavior).

### Worked example

A state party in the US holds 30 PS, which is the cap, and 5 PS arrives each turn. The state chair clicks Build Org four times in one turn: 1, 2, 3, 4 PS, so **10 PS** and about **₳28,100** (₳2,813, 5,625, 8,438, 11,250 in an average-size state). The reserve falls to 20. The ladder is at 4, and next turn it drops to 1. The chair now holds 25 PS, still below the cap. A party that never spends sits at 30 and wastes its income.

## What you can do

- **Spend PS on Build Org** from the state party page.
- **Set tax and budgets** from the treasury controls.
- **Invest treasury in PS.** The chair sets a budget that buys extra PS each turn.
- **Run NPP management and slates** from the party page.
- **Watch your tier badge.** Aim for 20% Org in enough regions.

**Tips.**
- Spend PS before you hit the cap; the cap wastes income.
- Space out Build Org clicks in one state to keep the ladder low.
- Check the demotion countdown if you are Major and slipping below 10% in many regions.

## Connections

**Driven by**

- [Party Membership](/wiki/party-membership): member taxes fill the treasury that funds everything here.
- [Party Leadership](/wiki/party-leadership): officers choose how resources are spent.
- [Party Organization](/wiki/party-organization): Org share earns regions toward Major tier and makes GOTV more efficient.
- [Party Leadership & Authority](/wiki/party-leadership-authority): the shield halves Suppression against unmanned built-in parties.
- [Political Parties](/wiki/political-parties): a party's tier and treasury are part of the party record.

**Affects**

- [Party Organization](/wiki/party-organization): PS and money pay for each Build Org click.
- [NPPs Overview](/wiki/npps-overview): recruitment and management spend resources to add and steer NPPs.
- [NPP Elections](/wiki/npp-elections): Slate assignments move NPPs into races.
- [Party Slate](/wiki/party-slate): loyalty and cooperation actions change whether a slated NPP is likely to accept.
- [NPP Behavior](/wiki/npp-behavior): whips add pressure to NPP votes at no cost.
- [Demographics & Targeting](/wiki/demographics-targeting): GOTV and suppression change voter groups' turnout.

## Status

Live in every world and country with parties. Tiers apply everywhere; in one-party states the ruling party is always Major. Prices shown in ₳ are for the US and scale to each country's currency.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Party Influence design page](https://docs.lakesidegames.net/design/party-influence.html) and the [Party Building design page](https://docs.lakesidegames.net/design/party-building.html).
`;
