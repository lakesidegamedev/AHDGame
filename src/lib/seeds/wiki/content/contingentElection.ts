export const contingentElectionContent = `# Contingent Election

If no presidential ticket wins a majority of the Electoral College, the House elects the President and the Senate elects the Vice President. This is the 12th Amendment fallback. It matters because a candidate who finishes in the top three in electoral votes can still become President, and party strength in Congress then counts for more than the campaign.

## How it works

A majority is more than half of the electors the era's census actually apportioned: 270 of 538 today, 266 of 531 in the 1950s. See [Election Mechanics](/wiki/election-mechanics) for how the normal count works. This only applies to the US presidential race.

![Flow of a contingent election: the House picks the President and the Senate the Vice President, with a House deadlock seating the VP as acting president while ballots continue.](/wiki-images/diagrams/contingent-election-flow.svg)

### Key numbers

| Rule | Value |
| --- | --- |
| Candidates the House chooses from | Top 3 by electoral votes |
| Tickets the Senate chooses from | Top 2 by electoral votes |
| House majority needed | 26 of 50 state delegations (25 of 48 in the 1950s) |
| Senate majority needed | 51 of 100 senators (49 of 96 in the 1950s) |
| House voting window after a deadlock | 24 turns, one ballot per turn |
| DC in the House ballot | Excluded |

### Who's on the ballot

The two chambers don't vote on the same candidate lists, and neither one is a free-for-all:

| Chamber | Elects | Eligible candidates |
| --- | --- | --- |
| House | President | The **top 3** presidential candidates by electoral vote |
| Senate | Vice President | The running mates of the **top 2** tickets by electoral vote |

If the VP ballot only has one eligible running mate (because two tickets shared a running mate, for example), that candidate wins outright and the Senate doesn't need to vote at all.

### The House votes by state, not by member

This is the part that surprises people: the House doesn't do a normal member-by-member roll call. Each **state delegation** casts one combined vote. Your state's representatives don't each get a vote in the contingent count, they decide how their state's single vote gets cast. Winning the Presidency this way takes **a majority of the delegations on the ballot**: 26 of 50 on the modern map, 25 of 48 in a 1950s world.

DC has electoral votes in the normal count but no voting House delegation, so it's excluded from this ballot entirely.

A delegation votes for whichever candidate has a strict majority of that state's weighted representative picks. If a delegation is split with no majority, that state's vote is a tie and it **abstains**. A delegation with no eligible voters or no eligible candidates also abstains.

### The Senate votes one senator, one vote

No delegation weighting here. Every senator casts a single vote among the eligible VP candidates. Electing the Vice President takes **a majority of the senators voting**: 51 of 100 today, 49 of 96 in the 1950s.

### How each member picks

Every House member and senator scores each eligible candidate on two things: whether the candidate shares their party, and how far apart their policy positions are.

A shared party affiliation is worth a flat bonus, large enough to usually decide things on its own, but not so large that a big ideology gap can't still flip a close call. Distance is measured the same way as everywhere else in the game: the sum of the economic and social axis gaps between the voter's own position and the candidate's.

Each member votes for whoever scores best against them personally. If two candidates tie for a given voter, the game breaks the tie deterministically off the election's own ID, so replaying the same election always produces the same picks, nothing here is decided by a fresh coin flip each time.

### Winning, and what happens on a deadlock

Once both initial ballots are tallied:

1. Whoever has the most votes leads.
2. If the leader clears the chamber's threshold, a majority of the delegations or of senators, they win.
3. If no presidential candidate reaches a majority of state delegations, the Senate's vice-presidential pick is seated as **acting president** and the House keeps voting, one ballot per turn, until a candidate reaches the majority or the vote window closes (24 turns). Coalitions tend to vote together, individual members can change their vote between ballots, and chamber chairs can whip their members. An acting president is recorded as an appointment, not an election win. It does not raise the term counter, but the career-history count includes appointments, so treat it as a term (see [Executive Term Limits](/wiki/executive-term-limits)).
4. In the rare case where a chamber produces no usable votes at all (nobody could pick, or the chamber ballot itself was empty), the game falls back to the original Electoral College count from before the contingent election even started, breaking ties by original electoral votes.

The Senate vote can still seat a Vice President. If the House window closes with no majority, the acting president keeps serving rather than the office sitting empty. A deadlock is resolved by continuing the House vote, not by a one-off tiebreak.

## What you can do

If your candidate makes the top 3 in electoral votes but falls short of an outright win, the campaign moves to Capitol Hill. The result records the full breakdown: every state's House pick, every senator's pick, and the totals.

- **Sitting House members** (players) can back one candidate in the open House vote from the election's House vote panel, and change their pick on any later ballot.
- **Party chairs and coalition chairs** can set a **whip** for their House members: a named candidate, or a free vote. A coalition whip covers every member party that has no whip of its own.
- **Members who are not players** (NPP members) vote by the scoring rule above, unless a whip from their party or coalition applies.

Tip: count delegations, not members. Flipping one member in a split state can move the whole state's vote.

## Worked example

Electoral college of 538: candidate A gets 260, B gets 250, C gets 28. Nobody has 270, so the House chooses among A, B and C, and the Senate chooses a VP from the top two tickets (A and B).

First House ballot, 50 delegations: A 24, B 23, C 1, and 2 tied states abstain. 26 is needed, so nobody wins. The Senate's VP pick is seated as acting president. The House then ballots every turn. On the next ballot one tied state breaks for A and one B state flips: A 26, B 22. A wins, becomes President, and the acting president becomes Vice President. If no one gets 26 by turn 24, the vote closes and the acting president keeps serving.

## Common questions

- **Who votes in the House: players or NPPs?** Both. Seated player House members vote themselves. Everyone else votes by the scoring rule.
- **Can I influence my state's delegation?** Yes: change your own pick, win over members of your delegation, or have a party or coalition chair whip.
- **What if the House stays deadlocked after 24 turns?** The vote closes with no winner and the acting president keeps serving.
- **Does the acting president count as a term?** In practice yes. The term counter is not raised, but the career history records an appointment and the term-limit count includes appointments. See [Executive Term Limits](/wiki/executive-term-limits).
- **Does DC vote?** No. DC has electors but no House delegation in this ballot.
- **What if nobody can vote at all?** The game falls back to the original electoral college count, ordered by electoral votes.

## Connections

**Driven by**

- [Election Mechanics](/wiki/election-mechanics): a presidential race with no electoral majority starts the process.
- [Live Election Results](/wiki/live-election-results): the electoral vote totals shown on election night decide whether it is needed.
- [General Elections](/wiki/general-elections): with no electoral majority in the general, the House and Senate decide.

**Affects**

- [Executive Term Limits](/wiki/executive-term-limits): an acting presidency is recorded as an appointment and adds to the term total.
- [Election Mechanics](/wiki/election-mechanics): the House or Senate result replaces the Electoral College winner.

## Status

Live in US presidential elections whenever no ticket reaches an electoral majority. Thresholds follow the era: 270 of 538 electors, 26 of 50 delegations and 51 of 100 senators in the modern era, and the smaller 1950s counts in a 1950s world. Other countries do not have this fallback.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants and edge cases are on the [contingent election design page](https://docs.lakesidegames.net/design/contingent-election.html).
`;
