export const pollingContent = `# Polling

Before you declare, before you pour money into ads, and again when a general gets tight, you need to know where you actually stand. A poll is a paid action that estimates how your home state's voters would split right now. It is a projection built from the same inputs as the vote model ([Election Mechanics](/wiki/election-mechanics) defines it), not a replay of the count, so treat it as a strong guide rather than a guarantee. There are two tiers, Quick and Full. A poll tells you whether to enter a race and which voter groups to work on.

## What a poll runs

A poll always covers your home state. If you are an active candidate in a race there (or in a national race for your country), the poll adds that race's field: your rivals in the general, or your own party's rivals during a primary. With no candidacy it shows only your own standing with the voters. The game runs the group-by-group model using the groups and leanings from [Demographics](/wiki/demographics) and shows you the result. Nothing changes in the race: a poll only reads it.

For **state races** (House, Senate, Governor, State Senate, Commons, Bundestag constituencies, Sangiin, Shugiin) the head-to-head share splits each group between the candidates by appeal, reach, approval, party organization, registration and infamy, then applies the first-past-the-post spoiler rule (a third party draws votes equal to 4% of its own vote from the nearest major party). Races on the newer campaign rules run the general-election swing-flow model on your home state instead. Either way it leaves out parts of the real count, such as the turn-by-turn release of the pool, so it is a projection, not the exact result.

For **presidential races** your poll is a **home-state projection only**. The actual presidential vote runs per electoral unit with party-weighted positions, national influence for reach, ground game, the national mood and a 2% organization-aware spoiler. A poll shows what your home state would do. It does not forecast the Electoral College.

### Prices

| Item | Quick Poll | Full Demographic Poll |
| --- | --- | --- |
| Actions | 2 | 6 |
| Base fund cost | ₳25,000 | ₳75,000 |
| Intellect effect on fund cost | about 15% cheaper (Intellect 10) to 22% dearer (Intellect 1) | same |
| Era price level | Scales the fund cost | same |
| Cooldown | None | None |
| Returns | Topline appeal, voter counts and your 5 best and 5 worst groups | Every group, plus the turnout panel |

The poll page shows your exact quote before you pay. The action cost is flat per tier; your Intellect (see [Stats & Actions](/wiki/stats-actions)) and the era's price level set the fund cost. Campaign funds pay for each poll; see [Fundraising and Ads](/wiki/fundraising-ads).

### Quick Poll

Use it to decide whether to run, and whether to stay in a [primary](/wiki/primaries). It returns:

- Your overall appeal, the estimated voters and the voters you can reach.
- When you are in a race: each candidate's projected vote share, and yours as both a percentage and a raw vote count.
- **Best 5 groups:** where you have the most potential voters.
- **Worst 5 groups:** where you have the fewest. Those are your targets for ads and canvassing.

![Poll results panel with overall appeal, estimated voters, reachable voters and the estimated vote share](/wiki-images/screens/polling-quick-poll-results.webp)

### Full Demographic Poll

Use it to decide what to fix. It records, for every group in the electorate, a row with size, turnout, your reach, your appeal and your potential voters. It also shows the turnout modifiers on each group, so you can see who has been canvassed in this state, and the numbers give you a group-by-group view for [Demographics & Targeting](/wiki/demographics-targeting). Where the world has granular polls switched on, the Full Poll shows the [granular polling](/wiki/granular-polling) panel, with your share against each opponent in every voter segment.

**Two candidates, two polls.** A candidate who has just filed for a House primary runs a Quick Poll and sees 15% against an NPP at 65%. The poll cost 2 actions and about ₳25,000. They decide the race is not worth it and use their actions elsewhere. A different candidate in a competitive general runs a Full Poll and sees their worst three groups are Young voters, Low Income voters and Black voters, each 8 to 12 points behind. They then target ads at the Young group and canvass the other two in the final 4 turns.

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

- You can poll as many times per turn as you can afford, whether or not you are in a race; the race comparison only appears while you are an active candidate.
- Polling the same race three times in a row wastes resources because your stats have barely moved. One poll every 6 to 12 turns is usually enough.
- A poll is a snapshot of the vote model on the data at the moment you run it. It is as current as your stats and the state's turnout, and it does not predict what opponents will do next.

## Using the results

- **Run a Quick Poll** before any declaration, from the Poll action on the Actions page.
- **Run a Full Poll** at the start of a general and again mid-general if competitive.
- **Scout opponents.** Once you are in a race with them, every poll shows each rival's projected share, and the granular panel shows where in the electorate they beat you.
- **Act on the results:** target the worst groups with ads ([Fundraising and Ads](/wiki/fundraising-ads)) or turnout ([Canvassing](/wiki/canvassing), where the turnout modifiers say where it pays). Poll results also drive the closing sprint plan in [Campaign Strategy](/wiki/campaign-strategy).

Tips:

- Do not skip the Quick Poll before declaring.
- The worst-5 list is the most actionable output of any poll.
- Do not treat a presidential poll as a 270 forecast.
- A prime minister weighing a [snap election](/wiki/snap-elections) should poll first.
- Ten turns from the end, a Quick Poll is enough: if you are up 5 or more, coast. If tied or behind, prepare a burst for the final 4 turns.

Live in every world and country with elections. Presidential polls are home-state projections everywhere. Last checked 2026-10-30, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html)
`;
