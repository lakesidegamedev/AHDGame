export const granularPollingContent = `# Granular Polling

Your overall number looks flat, but you may be dominating one group and getting wiped out in another. Granular polling is a deeper read on the same electorate your normal poll covers. Instead of only an overall result, it breaks the state's voters into demographic segments, such as age, education or wealth, and shows how you and your rivals stand with each one, so you can spend ads and canvassing where they change votes.

## Getting the panel

Take a normal Quick or Full poll from the **Actions** page (see [Polling](/wiki/polling)). The panel is an extra section under your normal poll results, titled **Granular electorate**. It rides on the poll action you already take, with no extra cost and no extra action. Some older worlds show the standard poll only; nothing is broken on your end and there is nothing to unlock.

Available in current worlds for the US and for every country that has a census model, in primary and general polls. In presidential generals the panel counts your national campaign reach.

## What the panel shows

The voters in a state are built from **cells**: every combination of the census dimensions available for that country. In the US these are race, age, education and wealth. Other countries use their own census dimensions, such as ethnicity, income and how urban an area is. Census totals and era tables from [Demographics](/wiki/demographics) set each cell's size and turnout. The cells are scaled so they add up to each state's real census totals. Tiny cells are dropped: below 0.1% of the electorate, or below 0.25% when the panel reads a live campaign's electorate.

Each cell has its own share of the electorate, its own turnout, and its own read on you and your opponents. The cells come from the same census and era tables the vote count uses, so the poll and the real count cannot disagree about who the electorate is. Your standing in each cell is the poll's own projection, not the final count.

Pick a dimension tab, for example age, and you see its buckets (young, middle, mature, senior). For each bucket:

| Column | Meaning |
| --- | --- |
| Share of the electorate | How much of the state's voters this segment is |
| Turnout | Expected participation for the segment |
| You %, best opponent %, undecided % | Standing in that segment during an active election |
| Margin | Your share minus the best opponent's share |

You can click a chip in one dimension and then another to stack filters (one bucket per dimension) and drill down to a single cross-tab segment, such as young, college-educated voters. A table view lists every cell and can be sorted, and you can export it as a CSV file. If the "You", opponent and undecided columns are empty, there is no active election for you in that state right now. The share and turnout columns still work.

A high turnout in a segment multiplies its weight. A segment with a modest share and high turnout can matter more than a larger, low-turnout one.

| Item | Value |
| --- | --- |
| US baseline turnout, age | Young 38%, middle 56%, mature 66%, senior 76% |
| US baseline turnout, education | No college 52%, college 66%, graduate 74% |
| US baseline turnout, wealth | Low 44%, middle 60%, high 74% |
| Smallest cell kept | 0.1% of the electorate (0.25% during a campaign) |
| Extra cost over a normal poll | None |

Baseline turnouts are the modern US starting values. In an earlier era, the turnout tables change with the year, and your [canvassing](/wiki/canvassing) and get-out-the-vote work then move them.

## How far to trust a small segment

This poll does not interview anyone. The segments are projections from census demographics and the vote math, so the number labelled uncertainty is an **illustration**, not a sample-based margin of error. The panel shows it so you do not over-trust small segments. Smaller segments get a wider band because less of the electorate backs them.

| Item | Value |
| --- | --- |
| Baseline uncertainty band | 3.0 points for the whole electorate |
| Band for a segment | 3.0 divided by the square root of the segment's share |

\`\`\`wiki-chart
granular-poll-uncertainty
\`\`\`

Say you are polling a state and the panel shows the segment of young, college-educated voters.

- Share of the electorate: 8%
- Turnout: 61%
- You: 44%, best opponent: 41%, undecided: 15%
- Margin: +3

The uncertainty band for this segment is 3.0 divided by the square root of 0.08 (0.283), about 10.6 points. A +3 lead is well inside that, so treat it as a toss-up. Compare the whole electorate, where the band is just 3.0, or a segment with 25% of the electorate, where it is 6.0. A stacked filter that leaves 1% of the electorate has a band of 30 points and tells you almost nothing. Do not commit a whole strategy to one narrow cross-tab; treat a small segment as direction only.

## Aiming the campaign

Use weak segments as targets for [Canvassing](/wiki/canvassing) and [Campaign Manager](/wiki/campaign-manager) work, and see [Demographic Targeting](/wiki/demographics-targeting) for which segments to aim ads and visits at.

Applies in current worlds with a census model. Last checked 2026-10-29, version 1.18.0. Exact rules: [The Granular Layer-1 Electorate (as shipped)](https://docs.lakesidegames.net/design/granular-electorate-as-shipped.html)
`;
