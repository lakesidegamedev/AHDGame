export const granularPollingContent = `# Granular Polling

Granular polling is a deeper read on the same electorate your normal poll covers. Instead of only an overall result, it breaks the state's voters into demographic segments, such as age, education or wealth, and shows how you and your rivals stand with each one. It matters because it tells you where your support is weak inside a state, which an overall number can hide.

## How it works

The voters in a state are built from **cells**: every combination of the census dimensions available for that country. In the US these are race, age, education and wealth. Other countries use their own census dimensions, such as ethnicity, income and how urban an area is. The cells are scaled so they add up to each state's real census totals. Tiny cells below 0.25% of the electorate are dropped.

Each cell has its own share of the electorate, its own turnout, and its own read on you and your opponents. The same vote math that decides the election runs on these cells, so the poll and the real count cannot disagree about who the electorate is.

The panel is an extra section under your normal poll results, titled **Granular electorate**. It rides on the poll action you already take, small or large, with no extra cost and no extra action.

### What the panel shows

Pick a dimension tab, for example age, and you see its buckets (young, middle, mature, senior). For each bucket:

| Column | Meaning |
| --- | --- |
| Share of the electorate | How much of the state's voters this segment is |
| Turnout | Expected participation for the segment |
| You %, best opponent %, undecided % | Standing in that segment during an active election |
| Margin | Your share minus the best opponent's share |

You can click a chip in one dimension and then another to stack filters and drill down to a single cross-tab segment, such as young, college-educated voters. A table view lists every cell and can be sorted, and you can export it as a CSV file.

### Key numbers

| Item | Value |
| --- | --- |
| Smallest cell kept | 0.25% of the electorate |
| Baseline uncertainty band | 3.0 points for the whole electorate |
| Band for a segment | 3.0 divided by the square root of the segment's share |
| US baseline turnout, age | Young 38%, middle 56%, mature 66%, senior 76% |
| US baseline turnout, education | No college 52%, college 66%, graduate 74% |
| US baseline turnout, wealth | Low 44%, middle 60%, high 74% |
| Extra cost over a normal poll | None |

Baseline turnouts are the modern US starting values. In an earlier era, the turnout tables change with the year, and your canvassing and get-out-the-vote work then move them.

### Reading the uncertainty band

This poll does not interview anyone. The segments are projections from census demographics and the vote math, so the number labelled uncertainty is an **illustration**, not a sample-based margin of error. The panel shows it so you do not over-trust small segments. Smaller segments get a wider band because less of the electorate backs them.

\`\`\`wiki-chart
granular-poll-uncertainty
\`\`\`

### Worked example

You are polling a state and the panel shows the segment of young, college-educated voters.

- Share of the electorate: 8%
- Turnout: 61%
- You: 44%, best opponent: 41%, undecided: 15%
- Margin: +3

The uncertainty band for this segment is 3.0 divided by the square root of 0.08 (0.283), about 10.6 points. A +3 lead is well inside that, so treat it as a toss-up. Compare the whole electorate, where the band is just 3.0, or a segment with 25% of the electorate, where it is 6.0. A stacked filter that leaves 1% of the electorate has a band of 30 points and tells you almost nothing.

### Why it exists

Your overall appeal can look flat while you dominate one group and get wiped out in another. The granular panel finds that split, so you can spend ads and canvassing where they change votes.

## What you can do

- **Run any poll.** Take a normal Quick or Full poll from the **Actions** page. The Granular electorate panel appears under the results when it is available. See [Polling](/wiki/polling).
- **Pick a dimension tab** to see one demographic at a time, then stack filters to isolate a single segment.
- **Open the table view and export CSV** to compare cells side by side.
- **Aim your campaign.** Use weak segments as targets for [Canvassing](/wiki/canvassing) and [Campaign Manager](/wiki/campaign-manager) work.

Tips:

- Do not commit a whole strategy to one narrow cross-tab. The band grows quickly as the segment shrinks.
- If the "You", opponent and undecided columns are empty, there is no active election for you in that state right now. The share and turnout columns still work.
- A tall turnout in a segment multiplies its weight. A segment with a modest share and high turnout can matter more than a larger, low-turnout one.

### Common questions

- **Why don't I see the panel?** Some older worlds show the standard poll only. Nothing is broken on your end and there is nothing to unlock.
- **How reliable is a small segment?** Treat it as direction only. See the band above.
- **Do I pay extra?** No. It comes with the poll.
- **Can I stack filters?** Yes, across dimensions, one bucket per dimension.

## Connections

**Driven by**

- [Demographics](/wiki/demographics): census totals and era tables set each cell's size and turnout.
- [Canvassing](/wiki/canvassing): canvassing and get-out-the-vote work change segment turnout.
- [Polling](/wiki/polling): the poll action produces the panel.

**Affects**

- [Demographic Targeting](/wiki/demographics-targeting): shows which segments to aim ads and visits at.
- [Campaign Manager](/wiki/campaign-manager): weak segments guide where to spend campaign effort.

## Status

Available in current worlds for the US and for every country that has a census model, in primary and general polls. Some older worlds show the standard poll only. In presidential generals the panel counts your national campaign reach.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules, constants and source files: [The Granular Layer-1 Electorate (as shipped)](https://docs.lakesidegames.net/design/granular-electorate-as-shipped.html).
`;
