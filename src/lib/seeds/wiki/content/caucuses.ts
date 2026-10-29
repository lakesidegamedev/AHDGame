export const caucusesContent = `# Caucuses

A caucus is a faction inside your national party. Members share a line, pool a small treasury, and can be whipped as a smaller bloc than the whole party. Caucuses also hold non-player politicians ([NPPs](/wiki/npps-overview)), and keeping those NPPs loyal is the hard part. A health label on each caucus tells you whether it is about to lose people.

## How it works

Any member of a national party can found a caucus for free. You pick a name, a colour, an optional motto and a tax rate from 0% to 5%, and you become its chair. You can belong to only one caucus at a time and chair only one. State and regional chapters have no caucuses.

Players join and leave on their own. NPPs are different: only the chair can recruit them, and they stay only while they like the chair.

1. **Recruit.** The chair needs a relationship of at least 60 with an NPP of the same party who is not retired and not already in another caucus. A successful recruit starts a 12 turn cooldown for the whole caucus.
2. **Drift.** Every turn, every relationship between you and an NPP moves 0.1 closer to zero, whether positive or negative.
3. **Upkeep.** After the drift, any NPP whose relationship with the current chair is below 20 leaves the caucus.

The gap between 60 to join and 20 to stay is deliberate. Joining is hard so a caucus means something. Staying is easy so a chair is not punished for one slow week.

### Key numbers

| Rule | Value |
| --- | --- |
| Relationship needed to recruit an NPP | 60 |
| Relationship below which an NPP leaves | 20 |
| Recruit cooldown, whole caucus | 12 turns |
| Relationship drift toward zero | 0.1 per turn |
| Caucus tax | 0% to 5% |
| Health window for joins and exits | last 12 turns |
| Watch band (listed, not urgent) | 25 up to 30 |
| Elevated band | 20 up to 25 |
| Critical band | below 20 |

A turn is one hour at the standard pace. An NPP recruited at exactly 60 and never contacted again drops below 20 after 401 turns, about 17 days. One [private meeting](/wiki/political-capital) (+5) buys back 50 turns of drift.

### Health labels

Every caucus shows one label, with a one line reason. The first rule that matches wins.

| Label | Shown when |
| --- | --- |
| **Fragile** | The chair seat is empty, or an NPP is already below 20, or any member was forced out in the last 12 turns, or 3 or more [whip defiance](/wiki/voting-and-whips) cases are open |
| **Strained** | Any NPP is listed as at risk, or a player left in the last 12 turns, or 1 or 2 defiance cases are open, or a chair election is running |
| **Healthy** | None of the above |

Any NPP that leaves counts as a forced exit, because NPPs never choose to leave: the relationship upkeep removes them. So one NPP drifting out turns the caucus Fragile for 12 turns, even if everyone else is happy.

The at-risk list shows up to five NPPs whose relationship with the chair is below 30, worst first, with the gap to the exit line of 20. An NPP below 20 is marked Critical and leaves at the next upkeep.

### Worked example

You chair the Rural Bloc caucus. An NPP senator joined at relationship 60 and you have not met her since. At turn 301 she is at 29.9, so she appears as Watch with a gap of 9.9. At turn 351 she is at 24.9 and becomes Elevated, and the caucus turns Strained. Two private meetings (6 actions, no funds) lift her to 34.9 and she leaves the list. If you ignore her until turn 401 she hits 19.9 and leaves at that turn's upkeep. The caucus turns Fragile for 12 turns, and she needs a fresh 60 to be recruited again.

A new chair inherits the roster but not the old chair's relationships. Upkeep checks every NPP against whoever chairs now, so a freshly elected chair who barely knows the NPPs can lose several at once.

## What you can do

All of this is in the national party page, under the **Caucuses** tab. Each caucus has Overview, Roster, Whip, Elections and (chair only) Chair's Office sub-tabs.

- **Found or join a caucus.** Any party member. Leave first before founding another.
- **Read the health card.** The Overview shows the label, recent joins and exits, defiance count, and the at-risk NPPs. A summary also sits in the party Analytics tab.
- **Recruit NPPs and manage money (chair).** The Chair's Office lists recruitable NPPs, sets the tax, sends funds to members, and moves funds back to the party treasury. Tax is taken each turn as a percentage of a member's projected income, and skipped for members who cannot afford it.
- **Whip the caucus.** The Whip tab works like the party [Whip Room](/wiki/voting-and-whips) but only reaches caucus members.
- **Run for chair.** Active player members can declare, withdraw and vote. NPPs neither run nor vote. Elections run alongside the party's national leadership cycle, and ties go to the earliest declaration.

Tips:

- Meet at-risk NPPs with [Political Capital](/wiki/political-capital) before they reach 25, not after. A private meeting costs 3 actions and no funds.
- Watch the Fragile reason. A single forced exit explains most sudden drops.
- Defiance is a warning sign. If members start breaking the caucus whip, find out which bill split them before the label turns Fragile at 3.

## Connections

**Driven by**

- [Political Capital](/wiki/political-capital): your relationship with each NPP decides whether you can recruit it and whether it stays.
- [NPP Behavior](/wiki/npp-behavior): NPP relationships drift toward zero on their own, which is what erodes a caucus.
- [Voting and Whips](/wiki/voting-and-whips): open whip defiance cases push the health label to Strained or Fragile.
- [Party Leadership](/wiki/party-leadership): the national chair election window sets when caucus chairs are elected.

**Affects**

- [Voting and Whips](/wiki/voting-and-whips): a caucus whip adds a smaller bloc whose members follow the chair's line on bills.
- [Party Organization](/wiki/party-organization): caucuses add a sub-treasury, a tax and a faction layer inside the national party.
- [NPPs Overview](/wiki/npps-overview): an NPP joining or leaving a caucus changes which faction it belongs to.

## Status

Live in every world for national parties. State and regional chapters have no caucuses.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules, sub-tabs and treasury controls are on the [Caucuses design page](https://docs.lakesidegames.net/design/caucuses.html).
`;
