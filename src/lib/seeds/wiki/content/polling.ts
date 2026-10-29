export const pollingContent = `# Polling

Before you declare, before you pour money into ads, and again when a general gets tight, you need to know where you actually stand. A poll is a paid action that simulates what would happen if the election resolved right now. For state races it runs the **same vote math** the turn processor uses ([Election Mechanics](/wiki/election-mechanics) defines it), so what it predicts is what you would get at that moment. There are two tiers, Quick and Full. A poll tells you whether to enter a race and which voter groups to work on.

## What a poll runs

You pick a poll for a race you are in or about to declare in. The game runs the group-by-group vote model on the current field, using the groups and leanings from [Demographics](/wiki/demographics) and shows you the result. Nothing changes in the race: a poll only reads it.

For **state races** (House, Senate, Governor, State Senate, Commons, Bundestag constituencies, Sangiin, Shugiin) a poll uses the same group-level allocation as real vote accumulation, including the first-past-the-post spoiler rule (a third party draws 4% of its group votes from the nearest major party). The poll shows your raw allocation, the spoiler adjustment, and the final share. It is the case that will run when the election resolves, not a worst case.

For **presidential races** your poll is a **home-state projection only**. The actual presidential vote runs per electoral unit with party-weighted positions, state lean, ground game and a 2% organization-aware spoiler. A poll shows what your home state would do. It does not forecast the Electoral College.

### Prices

| Item | Quick Poll | Full Demographic Poll |
| --- | --- | --- |
| Actions | 2 | 6 |
| Base fund cost | ₳25,000 | ₳75,000 |
| Intellect effect on fund cost | about 20% cheaper to 20% dearer | same |
| Era price level | Scales the fund cost | same |
| Cooldown | None | None |
| Returns | Topline share plus 5 best and 5 worst groups | Every group, with a gap analysis |

The poll dialog shows your exact quote before you pay. Action costs and your Intellect (see [Stats & Actions](/wiki/stats-actions)) set the price, and the fund cost drops with higher Intellect and follows the era's price level. Campaign funds pay for each poll; see [Fundraising and Ads](/wiki/fundraising-ads).

### Quick Poll

Use it to decide whether to run, and whether to declare in a [primary](/wiki/primaries) at all. It returns:

- Each candidate's projected vote share, and yours as both a percentage and a raw vote count.
- **Best 5 groups:** where your share is highest.
- **Worst 5 groups:** where your share is lowest. Those are your targets for ads and canvassing.

![Poll results panel with overall appeal, estimated voters, reachable voters and the estimated vote share](/wiki-images/screens/polling-quick-poll-results.webp)

### Full Demographic Poll

Use it to decide what to fix. It returns, for every group in the electorate, a row with size, turnout, your appeal, your reach, your approval and the allocated vote count, with the same numbers for each opponent, plus a gap analysis of the largest differences. It also shows turnout modifiers on each group, so you can see who has been canvassed in this state, and the numbers give you a group-by-group view for [Demographics & Targeting](/wiki/demographics-targeting). The poll action produces the [granular polling](/wiki/granular-polling) panel.

**Two candidates, two polls.** A candidate runs a Quick Poll before a House primary and sees 15% against an NPP at 65%. The poll cost 2 actions and about ₳25,000. They decide not to enter and use the actions elsewhere. A different candidate in a competitive general runs a Full Poll and sees their worst three groups are Young voters, Low Income voters and Black voters, each 8 to 12 points behind. They then target ads at the Young group and canvass the other two in the final 4 turns.

### When to use each

| Situation | Poll |
| --- | --- |
| Considering declaring | Quick |
| Declared but unsure of strategy | Full |
| Mid-general, leading comfortably | Quick (spot-check) |
| Mid-general, competitive or behind | Full (diagnostic) |
| Primary season, picking a race | Quick |
| Final 4 turns of a general | Neither: act on your plan |

### Limits

- You can poll as many times per turn as you can afford, but the election must be active (primary started and not yet resolved).
- Polling the same race three times in a row wastes resources because your stats have barely moved. One poll every 6 to 12 turns is usually enough.
- A poll is a snapshot of the vote model on the data at the moment you run it. It is as current as your stats and the last turn's turnout, and it does not predict what opponents will do next.

## Using the results

- **Run a Quick Poll** before any declaration, from the race page.
- **Run a Full Poll** at the start of a general and again mid-general if competitive.
- **Scout opponents.** When a competitor declares, a Full Poll shows their appeal breakdown too.
- **Act on the results:** target the worst groups with ads ([Fundraising and Ads](/wiki/fundraising-ads)) or turnout ([Canvassing](/wiki/canvassing), where the turnout modifiers say where it pays). Poll results also drive the closing sprint plan in [Campaign Strategy](/wiki/campaign-strategy).

Tips:

- Do not skip the Quick Poll before declaring.
- The worst-5 list is the most actionable output of any poll.
- Do not treat a presidential poll as a 270 forecast.
- Polling is also what makes a prime minister want to call a [snap election](/wiki/snap-elections).
- Ten turns from the end, a Quick Poll is enough: if you are up 5 or more, coast. If tied or behind, prepare a burst for the final 4 turns.

Live in every world and country with elections. Presidential polls are home-state projections everywhere. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html)
`;
