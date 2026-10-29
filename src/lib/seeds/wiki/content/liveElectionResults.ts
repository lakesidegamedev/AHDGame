export const liveElectionResultsContent = `# Live Election Results

**Election night** is a results page that reveals calls and projections region by region instead of dropping one final number. It is only a display: the turn engine decides who won, and nothing on this page changes the outcome. It matters because it shows you how a close race is going, and why a state can lead without being called yet. It sits on top of the vote math in [Election Mechanics](/wiki/election-mechanics).

## How it works

National races (House, Commons, Bundestag, Dáil and the other multi-seat national chambers, plus presidential races) get a dedicated results view. Single-seat local races still show results, without the national seat board.

### Key numbers

| Rule | Value |
| --- | --- |
| Reporting cap before the final hour | 88% |
| Reporting level reached in the final hour before a region reveals | up to 98% |
| Reporting once a region reveals, or the election has ended | 100% |
| Lead needed for a call during the final hour | 5 percentage points |
| Lead needed for a call once the election has ended | any lead (ties are never called) |
| Page refresh while election night is on or resolving | every 10 seconds |
| Page refresh while waiting for the night to open | every 30 seconds |
| Seats for a majority | half the chamber, plus one |

### Before the final hour

The page shows each region's leader and a reporting percentage that creeps up as the general phase goes on, capped at 88% so nothing looks final too early. Nothing is called yet.

### The final hour

Every election has a **final hour**: the stretch between the second-to-last turn and the final turn. Each region gets a **reveal moment** at a fixed point inside that hour, somewhere between 6% and 94% of the way through. Before it, the region's reporting rises toward 98%. At the reveal it jumps to 100% and can be called.

Reveal order is fixed per election. If you refresh, or your rival watches the same race, everyone sees the same regions report in the same order. Nothing is random live. If the election clock is paused, the drip freezes too.

### When a region is called

A region is **called** when all of these hold:

- it is not tied
- it has received votes
- either the election has ended, or it has revealed **and** the leader is ahead by at least 5 percentage points

A lead below 5 points during the final hour shows as a lead, not a call. Once the election ends, every region that is not tied is called for its leader at any margin.

### National projection

For multi-seat national chambers the page also shows a top-line call:

- **Too early**: no seats projected anywhere yet.
- **Majority**: the leading party has reached half the chamber plus one.
- **Hung parliament**: below that, in a Westminster-style chamber (Commons, Dáil, Bundestag, Shūgiin, Holyrood, Senedd and the other parliamentary lower chambers).
- **Largest party**: below that, in other chambers. Shown as a lead over the runner-up.

For President, called regions add up to \`calledEv\` (called electoral votes) and regions with an uncalled lead add up to \`leadingEv\`. A late big region can flip the projection.

## Worked example

A state is at 52% to 47% for the leader, a 5 point lead, with 3 turns left. Reporting reads at most 88% and the state is shown as a lead. In the final hour its reveal moment arrives at 40% of the way through: reporting jumps to 100% and, because 52 minus 47 is exactly 5 points, it is called. A neighbouring state at 51% to 48% reveals at the same time and stays "leading", a 3 point lead, until the election ends. Then it is called for its leader. The votes never changed between those views; only what the page shows did.

## What you can do

- Open the election from the elections list during the final hours and watch the night view. Everyone sees the same reveal order.
- Read **lead** and **called** differently: a lead is a snapshot of current votes, a call says the page considers the region decided.
- Keep campaigning. Canvassing, ads and fundraising work as always, up to the final 4 turns of the general phase, which carry 30% of the vote pool. See [General Elections](/wiki/general-elections).
- For a presidential general, the [Vote Factor Ledger](/wiki/vote-factor-ledger) breaks each candidate's national total into the factors that built it.

## Common questions

- **Why is my state leading but not called?** The lead is under 5 points, or it has not reached its reveal moment yet. It will be called when the election ends unless it is tied.
- **Does this page change who wins?** No. It is built from the same numbers the turn engine uses.
- **When do states report?** Before the final hour, slowly and capped at 88%. In the final hour, in a fixed order across the hour.
- **Hung parliament or largest party?** Westminster-style chambers say hung parliament when nobody has half the seats plus one. Other chambers say largest party.
- **No electoral majority for President?** See [Contingent Election](/wiki/contingent-election).

## Connections

**Driven by**

- [Election Mechanics](/wiki/election-mechanics): the vote totals that the page reveals.
- [General Elections](/wiki/general-elections): the general phase length and the final-turns vote weighting set what there is to reveal.

**Affects**

Nothing. This page is a display layer and changes no game state. Related pages that use the same totals:

- [Contingent Election](/wiki/contingent-election): the electoral vote totals shown here decide whether the House has to vote.
- [Vote Factor Ledger](/wiki/vote-factor-ledger): breaks the same totals into their causes.

## Status

Election night is shown in worlds that have it turned on, for national and presidential races. In worlds without it you see results when the election ends. The page never changes who wins.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants and edge cases are on the [live election results design page](https://docs.lakesidegames.net/design/live-election-results.html).
`;
