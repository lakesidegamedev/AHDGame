export const contingentElectionContent = `# Contingent Election

Nobody reached the magic number. Your candidate has 260 electoral votes, a rival has 250, and the decision now belongs to Congress. Under the 12th Amendment fallback, the House elects the President and the Senate elects the Vice President. A candidate who finishes in the top three in electoral votes can still become President, and party strength in Congress then counts for more than the campaign.

This only applies to the US presidential race. A majority is more than half of the electors the era's census actually apportioned: 270 of 538 today, 266 of 531 in the 1950s. See [Election Mechanics](/wiki/election-mechanics) for how the normal count works, and [Live Election Results](/wiki/live-election-results) for the electoral vote totals shown on election night, which decide whether this process is needed. With no electoral majority in the [General Elections](/wiki/general-elections) count, the House and Senate decide, and their result replaces the Electoral College winner.

![Flow of a contingent election: the House picks the President and the Senate the Vice President, with a House deadlock seating the VP as acting president while ballots continue.](/wiki-images/diagrams/contingent-election-flow.svg)

| Rule | Value |
| --- | --- |
| Candidates the House chooses from | Top 3 by electoral votes |
| Tickets the Senate chooses from | Top 2 by electoral votes |
| House majority needed | 26 of 50 state delegations (25 of 48 in the 1950s) |
| Senate majority needed | 51 of 100 senators (49 of 96 in the 1950s) |
| Automatic House ballots before a deadlock | 2 (the second without the last-placed candidate) |
| House voting window after a deadlock | 24 turns, one ballot per turn |
| DC in the House ballot | Excluded |

## Who is on each ballot

The two chambers don't vote on the same candidate lists, and neither one is a free-for-all:

| Chamber | Elects | Eligible candidates |
| --- | --- | --- |
| House | President | The **top 3** presidential candidates by electoral vote |
| Senate | Vice President | The running mates of the **top 2** tickets by electoral vote |

If the VP ballot only has one eligible running mate (because two tickets shared a running mate, or only one ticket has one, for example), that candidate wins outright and the Senate doesn't need to vote at all.

## How the House counts: by state, not by member

This is the part that surprises people: the House doesn't do a normal member-by-member roll call. Each **state delegation** casts one combined vote. Your state's representatives don't each get a vote in the contingent count, they decide how their state's single vote gets cast. Winning the Presidency this way takes **a majority of the delegations on the ballot**: 26 of 50 on the modern map, 25 of 48 in a 1950s world.

DC has electoral votes in the normal count but no voting House delegation, so it's excluded from this ballot entirely.

A delegation votes for whichever candidate has the most of that state's weighted representative picks (a plurality, not a majority). If two or more candidates tie for the most, that state's vote is a tie and it **abstains**. A delegation with no eligible voters or no eligible candidates also abstains.

The Senate is simpler: every senator casts a single vote among the eligible VP candidates, with no delegation weighting. The target is **a majority of the whole Senate roster**: 51 of 100 today, 49 of 96 in the 1950s. If nobody reaches it, the VP candidate with the most senators still wins, with ties broken deterministically, so the Senate never deadlocks.

## How each member picks

Every House member and senator scores each eligible candidate on two things: whether the candidate shares their party (or a coalition partner's party), and how far apart their policy positions are.

A shared party is worth 35 points and a coalition partner's candidate 30. Distance is measured the same way as everywhere else in the game: the sum of the economic and social axis gaps between the voter's own position and the candidate's, at most 20. So a member always prefers their own party's candidate over any candidate outside their coalition, and ideology only decides between candidates with the same standing, or between their own party and a coalition partner when the gap differs by more than 5.

Each member votes for whoever scores best against them personally. If two candidates tie for a given voter, the game breaks the tie deterministically off the election's own ID, so replaying the same election always produces the same picks, nothing here is decided by a fresh coin flip each time.

The two automatic ballots use this scoring rule for everyone. In the open House vote after a deadlock, NPP members and players who have not voted follow their party's whip, then their coalition's, and only then this scoring rule.

## Influencing the vote

If your candidate makes the top 3 but falls short of an outright win, the campaign moves to Capitol Hill. The result records the full breakdown: every state's House pick, every senator's pick, and the totals.

- **Sitting House members** (players) can back one candidate in the open House vote from the election's House vote panel, and change their pick on any later ballot. A player's own pick always counts, even against a whip.
- **Party chairs and coalition chairs** can set a **whip** for their House members: a named candidate, or a free vote. A coalition whip covers every member party that has no whip of its own.
- Count delegations, not members. Flipping one member in a split state can move the whole state's vote. You can also win over other members of your delegation.

## A deadlock

Once the chambers have voted:

1. Whoever has the most votes leads.
2. If the leader clears the chamber's threshold, a majority of the delegations or of senators, they win.
3. If nobody reaches 26 delegations on the first House ballot and there are three candidates, the one with the fewest delegations (then fewest electoral votes) withdraws and a second ballot runs. On it, a state that would otherwise tie casts its vote for the candidate its members score highest in total.
4. If no presidential candidate reaches a majority of state delegations after that, the Senate's vice-presidential pick is seated as **acting president** and the House keeps voting, one ballot per turn, until a candidate reaches the majority or the vote window closes (24 turns). Coalitions tend to vote together, individual members can change their vote between ballots, and chamber chairs can whip their members.
5. In the rare case where a chamber produces no usable votes at all (nobody could pick, or the chamber ballot itself was empty), the game ranks that chamber's candidates by the original Electoral College count instead. For the House this only seats a president when there is no Senate VP to act; otherwise it still counts as a deadlock.

If the House window closes with no majority, the vote closes with no winner and the acting president keeps serving rather than the office sitting empty. A House deadlock is resolved by continuing the House vote, not by a one-off tiebreak: the delegation plurality leader is never seated.

An acting president is recorded as an appointment, not an election win. It does not raise the term counter, but the career-history count includes appointments, so treat it as a term (see [Executive Term Limits](/wiki/executive-term-limits)), which counts the acting presidency toward your total.

## An example: 260, 250 and 28

Electoral college of 538: candidate A gets 260, B gets 250, C gets 28. Nobody has 270, so the House chooses among A, B and C, and the Senate chooses a VP from the top two tickets (A and B).

First House ballot, 50 delegations: A 24, B 23, C 1, and 2 tied states abstain. 26 is needed, so nobody wins. C withdraws and the second ballot runs: C's state and the two tied states now pick between A and B, and land A 25, B 25. Still no majority, so the Senate's VP pick is seated as acting president. The House then ballots every turn, with players voting and chairs whipping. On a later ballot one B state flips: A 26, B 24. A wins, becomes President, and the acting president becomes Vice President. If no one gets 26 by turn 24, the vote closes and the acting president keeps serving.

Thresholds follow the era: 270 of 538 electors, 26 of 50 delegations and 51 of 100 senators in the modern era, and the smaller 1950s counts in a 1950s world. Other countries do not have this fallback. Last checked 2026-10-30, version 1.18.0. Exact rules: [Contingent election (design)](https://docs.lakesidegames.net/design/contingent-election.html)
`;
