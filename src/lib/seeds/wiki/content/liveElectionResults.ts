export const liveElectionResultsContent = `# Live Election Results

Your state is ahead 51 to 48 with an hour to go, and the page still will not call it. That is election night: a results view that reveals calls and projections region by region instead of dropping one final number. It is only a display. The turn engine decides who won, and nothing here changes the outcome. It sits on top of the vote math in [Election Mechanics](/wiki/election-mechanics).

National races (House, Commons, Bundestag, Dáil and the other multi-seat national chambers, plus presidential races) get a dedicated results view. Single-seat local races still show results, without the national seat board. Open the election from the elections list during the final hours and watch the night view; everyone sees the same reveal order.

## What the page shows, and when

| Rule | Value |
| --- | --- |
| Reporting cap before the final hour | 88% |
| Reporting level reached in the final hour before a region reveals | up to 98% |
| Reporting once a region reveals, or the election has ended | 100% |
| Lead needed for a call during the final hour | 5 percentage points |
| Lead needed for a call once the election has ended | any lead (ties are never called) |
| Page refresh during a US presidential election night | every 10 seconds |
| Page refresh otherwise, while the race is live | every 30 seconds |
| Seats for a majority | half the chamber, plus one |

Before the final hour, the page shows each region's leader and a reporting percentage that creeps up as the general phase goes on, capped at 88% so nothing looks final too early. Nothing is called yet.

Every election then has a **final hour**: the stretch between the second-to-last turn and the final turn. Each region gets a **reveal moment** at a fixed point inside that hour, somewhere between 6% and 94% of the way through. Before it, the region's reporting rises toward 98%. At the reveal it jumps to 100% and can be called.

\`\`\`wiki-chart
live-results-reporting-curve
\`\`\`

Reveal order is fixed per election. If you refresh, or your rival watches the same race, everyone sees the same regions report in the same order. Nothing is random live. If the election clock is paused, the drip freezes too.

### US presidential election night

A US presidential race replaces this drip in its final hour with a broadcast. States close their polls in real-world closing order, between 6% and 70% of the way through the hour. Reporting then climbs to a cap of 90% to 97%, never 100% inside the hour, and the shown shares carry noise that shrinks as reporting rises. A state is called only when its counted lead is too big for the uncounted final turn to overturn, with a 5% safety margin; bigger leads are called at lower reporting (25% to 75%). A state within 3 points at 50% reporting or more shows as too close to call. The board counts the votes as of the second-to-last turn, and once the race resolves it shows the real final result. The rules above (88%, 98%, the 5 point call) apply to every other race and to presidential races outside the US.

## Lead versus call

A lead is a snapshot of current votes. A call says the page considers the region decided. A region is **called** when all of these hold:

- it is not tied
- it has received votes
- either the election has ended, or it has revealed **and** the leader is ahead by at least 5 percentage points

A lead below 5 points during the final hour shows as a lead, not a call. Once the election ends, every region that is not tied is called for its leader at any margin.

![Decision list for calling a region: tied or no votes means no call, an ended election is called, a final-hour reveal needs a 5 point lead, otherwise only the lead shows.](/wiki-images/diagrams/live-election-results-region-call.svg)

Take a state at 52% to 47% for the leader, a 5 point lead, with 3 turns left. Reporting reads at most 88% and the state is shown as a lead. In the final hour its reveal moment arrives at 40% of the way through: reporting jumps to 100% and, because 52 minus 47 is exactly 5 points, it is called. A neighbouring state at 51% to 48% reveals at the same time and stays "leading", a 3 point lead, until the election ends. Then it is called for its leader. The votes never changed between those views; only what the page shows did.

So if your state is leading but not called, the lead is under 5 points or it has not reached its reveal moment yet. It will be called when the election ends unless it is tied.

## The top-line call

For multi-seat national chambers the page also shows a national projection:

- **Too early**: no seats projected anywhere yet.
- **Majority**: the leading party has reached half the chamber plus one.
- **Hung parliament**: below that, in a Westminster-style chamber (Commons, Dáil, Bundestag, Shūgiin, Sangiin and the French, Italian, Spanish, Swedish and Turkish lower chambers).
- **Largest party**: below that, in other chambers. Shown as a lead over the runner-up.

For a US President, called regions add up to \`calledEv\` (called electoral votes) and regions with an uncalled lead add up to \`leadingEv\`. A late big region can flip the projection. If no candidate reaches an electoral majority, see [Contingent Election](/wiki/contingent-election), which takes over from the electoral vote totals shown here.

## While you watch

Keep campaigning. Canvassing, ads and fundraising work as always, up to the final 4 turns of the general phase, which carry 30% of the vote pool. The general phase length and that final-turns weighting, set in [General Elections](/wiki/general-elections), decide how much there is left to reveal. For a presidential general, the [Vote Factor Ledger](/wiki/vote-factor-ledger) breaks each candidate's national total into the factors that built it. The page itself changes no game state.

Election night is shown in worlds that have it turned on, for national and presidential races. In worlds without it you see results when the election ends. Last checked 2026-10-30, version 1.18.0. Exact rules: [Live election results (design)](https://docs.lakesidegames.net/design/live-election-results.html)
`;
