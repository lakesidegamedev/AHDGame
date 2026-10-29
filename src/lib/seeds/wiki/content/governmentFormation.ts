export const governmentFormationContent = `# Government Formation

In parliamentary countries (UK, Japan, Germany, Ireland) an election does not hand anyone a government. Until a Prime Minister (Chancellor in Germany, Taoiseach in Ireland) is seated, no bills can be proposed, and if nobody wins within 96 turns a snap election is called. A party or coalition chair nominates, and the lower chamber votes on it for 24 hours.

## After the count

Each country's government is either **formed** (a PM is seated and legislation proceeds) or **pending** (no PM, legislation frozen). The route from one to the other:

1. **Election resolves.** The turn processor updates each party's seat count. An election, snap or scheduled, opens the formation period (see [Snap Elections](/wiki/snap-elections)).
2. **Confidence motion for the incumbent.** If the sitting PM kept their seat, a confidence motion is filed automatically and runs 24 hours while the PM stays in office. It passes if Aye is at least Nay, so a tie keeps the PM. If it fails, the PM is removed and the government goes pending. If the incumbent lost their seat, no motion is filed.
3. **Nominations.** A qualifying chair files a PM appointment vote. Each vote runs 24 hours, and several can run at once. All lower-chamber members vote Aye, Nay or abstain.
4. **Seating.** The first appointment vote to finish with more Aye than Nay seats its nominee and cancels the others. Government becomes formed, the freeze lifts the next turn, and the vacancy clock clears. The new PM then appoints ministers directly and the old cabinet is cleared (see [Cabinet](/wiki/cabinet)).

![Government formation from the election result through the confidence motion or appointment votes to a seated PM or a snap election after 96 turns.](/wiki-images/diagrams/government-formation-flow.svg)

| Item | Value |
| --- | --- |
| Appointment or confidence vote | 24 hours |
| Appointment pass rule | More Aye than Nay among votes cast |
| Confidence motion pass rule | Aye at least equal to Nay |
| Majority of the chamber | Half the seats, rounded down, plus one (326 of 650) |
| Minimum seats to nominate | 15.38% of lower-chamber seats, rounded up (100 of 650 in the UK, 72 of 465 in Japan) |
| Vacancy clock | 96 turns (96 real hours, 4 days), then a snap election |
| Legislation freeze | From pending until the turn after a PM is seated |

## Who can nominate

Only a **party chair** (or vice chair when the chair seat is empty) or a **coalition chair** can file an appointment vote, and only if their party or coalition holds at least the minimum seats and has at least one player MP. Coalition chairs can nominate and bring partner seats to the vote (see [Coalitions](/wiki/coalitions)). The nominee must be a player character. A party with a majority files a majority government; one with fewer than half but above the minimum files a minority bid. Minority bids are allowed even when another bloc holds a majority, and the chamber simply votes them down if it wants to.

In [one-party states](/wiki/one-party-states) only the ruling party can seat a head of government, and they have their own rules on who may nominate. Presidential countries such as the US have no formation vote.

NPP MPs in the nominee's party, or in the nominee's coalition, vote Aye automatically. A party whip on the vote overrides that. NPPs in other parties cast no vote on an ordinary appointment, so they do not count against the bid. On a confidence motion, NPPs outside the PM's side vote Nay by default. NPPs do not weigh the nominee's ideology or favorability here. From autonomy level 1, NPP prime ministers and presidents form cabinets, and level 0 fills stalled prime minister seats (see [npp-autonomy](/wiki/npp-autonomy)).

## Counting seats in a 650 seat Commons

After an election: Party A 300 seats, Party B 280, Party C 70. Majority is 326, and the minimum to nominate is 100.

- A's chair can nominate and B's chair can nominate. C (70) cannot nominate alone.
- A files a vote for its leader. A's 300 seats vote Aye (its NPP seats automatically; its players by choice). B's players vote Nay, but B's NPP seats cast nothing. A leads and wins if Aye beats Nay, even with only 300 seats in favour, because abstaining and silent seats do not count.
- A better bid is a coalition: if A and C agree, the coalition chair files for 370 seats, a clear majority. The PM's coalition and partner parties are recorded.

Tips: count to 326 (or your chamber's majority) before you file; a bid with more Aye than Nay wins even without a chamber majority, so keep opponents' players from turning out.

## What you can do

- **File a PM appointment vote** from the government page if you chair a qualifying party or coalition.
- **Vote** on any open appointment vote if you are a lower-chamber member.
- **Whip** your party's NPP seats on the vote.
- **Negotiate** a coalition with other party chairs before filing. Coalition terms are agreed between players, in game or out of it.
- **Watch** the government page for status, the sitting PM, open votes with live tallies and time left, and the seat distribution.

## While there is no PM

While pending, no new bills or cabinet bills can be proposed, cabinet bill votes are blocked, and bills in progress stay paused in their current status (see [Bills & Legislation](/wiki/bills-legislation)). This applies to every parliamentary country, including one-party states that seat a head of government through the same route.

- **Why is the country stuck with no PM?** No qualifying chair has filed, or the bids keep losing. After 96 turns a snap election is called.
- **How do I become PM?** Be nominated by a qualifying party or coalition chair, then win the vote.
- **What can I do while legislation is frozen?** Negotiate, nominate, vote and whip. Everything else waits for a PM.

### The 96-turn clock

Whenever the government goes pending (after an election, a passed [no-confidence vote](/wiki/no-confidence-votes), a failed confidence motion or a resignation) the deadline is set to the current turn plus 96. If no PM is seated by then, a snap election is triggered and the normal limits on PMs calling elections are bypassed. A passed appointment vote clears the clock.

Appointment votes can also be filed while a no-confidence vote is active against the sitting PM, so the opposition can name a replacement first. A formed government with a sitting PM is what a motion targets. If the no-confidence vote passes, the appointment votes carry on in the new pending period. If it fails, all active appointment votes are cancelled.

Live in the UK, Japan, Germany and Ireland.

Last checked 2026-10-29, version 1.18.0. Exact rules and data: [Parliamentary government design doc](https://docs.lakesidegames.net/design/parliamentary-government.html)
`;
