export const noConfidenceVotesContent = `# No-Confidence Votes

You can have far more Aye votes than Nay and still lose a vote of no confidence. A Vote of No Confidence (VONC) is the parliamentary way to remove a sitting Prime Minister, Chancellor or Taoiseach, and the motion only wins if Aye votes reach an absolute majority of all lower-chamber seats. Abstentions and seats that never vote count in the government's favour.

## Filing the motion

1. **A member files the motion.** Any sitting lower-chamber member can propose it (in a one-party state only a ruling-party member can; see [One-Party States](/wiki/one-party-states)). Government must be formed (see [Government Formation](/wiki/government-formation)), no other VONC can be active, and 48 turns must have passed since the last one was proposed.
2. **The vote runs 24 hours.** Every sitting lower-chamber member can vote Aye (remove the government) or Nay (keep it). The count is weighted by seats held. The motion always runs the full window; it is counted when the 24 hours are up.
3. **NPP benches vote by party line** unless whipped (see [Voting & Whips](/wiki/voting-and-whips)): government and coalition NPPs vote Nay, opposition NPPs vote Aye, NPPs with no party do not vote. A party whip overrides the default. This runs during the vote and again before resolution.
4. **Resolution.** If Aye reaches the threshold the executive is removed. Otherwise the government stays.

![Timeline of a no-confidence motion: a 24 hour vote, then either removal with a 96 turn clock or the PM staying with a 48 turn filing cooldown.](/wiki-images/diagrams/no-confidence-votes-timeline.svg)

| Item | Value |
| --- | --- |
| Voting window | 24 hours |
| Threshold | Half of all lower-chamber seats, rounded down, plus one (326 of 650) |
| Filing cooldown | 48 turns (2 real days) from the last motion proposed in that country, pass or fail |
| Vacancy clock after a pass | 96 turns, then a snap election |
| Tie | Does not remove the government |

## Why 310 Aye is not enough

A 650 seat Commons needs 326 Aye. The opposition files, and 310 members vote Aye, 30 vote Nay and 310 do not vote. 310 is below 326, so the motion fails even though Aye beat Nay ten to one. Had the opposition whipped 16 more NPP seats to Aye, it would have reached 326 and the Prime Minister would be out. The filer then has to wait 48 turns before another motion can be filed.

The whole-chamber rule stops a government being toppled by a thin turnout. It is deliberately different from the Senate [cloture rule](/wiki/cloture-and-filibuster), which counts votes cast.

- **Why did the VONC fail when I had more Aye than Nay?** Aye must reach half the seats plus one, not just beat Nay.
- **Can the PM dodge it with a snap election?** No, not while the VONC is active.
- **Why can't I file another one?** The 48 turn cooldown counts from the last motion proposed, by anyone, in that country.

## Running the vote

- **File a motion** from your country's executive page (10 Downing Street in the UK, under the Nation menu), if you hold a lower-chamber seat and the cooldown has run out.
- **Vote** Aye or Nay. Individual player votes stay private; the executive page shows the Aye and Nay totals and a by-party breakdown of Aye, Nay and abstaining seats.
- **Whip** your party's NPP seats before the window closes.
- **File a replacement PM nomination** during the VONC if you chair a qualifying party or coalition.

Tips for the opposition: count the whole chamber including abstainers; whip your NPP benches; line up a replacement appointment vote. For the government: a whip makes your NPPs' Nay explicit, opposition votes still count, and you cannot call a snap election while the VONC is open.

## If the motion passes

- The executive is removed at once, and the cabinet and office fields are cleared.
- Government returns to pending and the 96-turn vacancy clock starts. Legislation is frozen (see [Bills & Legislation](/wiki/bills-legislation)), and formation restarts from scratch (see [Government Formation](/wiki/government-formation)); there is no direct hand-off to a runner-up.
- PM appointment votes already filed during the VONC stay active, and new ones can be filed.
- The removed leader is told the final count.

## If it fails

The executive stays, PM appointment votes filed during the VONC are cancelled, and the 48 turn cooldown still runs from the day the motion was proposed.

A passed motion does not call an election straight away. If nobody is seated in 96 turns the system triggers one. A sitting executive cannot call a voluntary snap election to escape a VONC: the gate blocks it until the confidence vote resolves. See [Snap Elections](/wiki/snap-elections).

Available in every parliamentary country, including the UK, Japan, Germany and Ireland. Presidential countries use elections or [Impeachment](/wiki/impeachment) instead. Most one-party states have no no-confidence motion at all; where one exists (the Soviet Union), only ruling-party members can file it.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Prime Minister no-confidence design doc](https://docs.lakesidegames.net/design/uk-pm-no-confidence.html)
`;
