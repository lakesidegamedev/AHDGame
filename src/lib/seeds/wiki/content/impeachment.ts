export const impeachmentContent = `# Impeachment

Impeaching a President takes 218 of 435 House seats and then 67 of 100 Senate seats, and a silent seat counts for the target. Impeachment removes a sitting executive in **presidential** systems: the President (or equivalent) through two chambers, or a state governor through that state's legislature. Parliamentary countries use a [Vote of No Confidence](/wiki/no-confidence-votes) instead. The bars are counted against all seats, so abstentions and empty seats work in the target's favour.

## Removing a President

1. **Filing.** A sitting member of the lower chamber (the US House) files articles. Only one case per target can be active at a time.
2. **Lower chamber vote, 6 turns.** Needs a strict majority of **all seats** in the chamber, not of votes cast: 218 of 435 in the US House. Abstentions and seats that never vote count against.
3. **Upper chamber vote, 6 turns.** Needs **two-thirds of all seats**: 67 of 100 in the US Senate. Same rule: abstentions and empty seats count against conviction.
4. **Conviction.** The President is removed and the seat is vacated. In the US the Vice President takes over that turn (unless the Vice President has already reached the presidential term limit). The sitting cabinet stays in place; it is only cleared when a President is next seated by election (see [Cabinet](/wiki/cabinet)). If the lower chamber does not impeach, the case ends there.

NPP blocs vote too. The target's own party defends them, opposition blocs from another major party vote to remove unless they sit close to the target ideologically (then it is a coin flip between removing and abstaining), and other blocs only back removal, half the time, when they are ideologically far from the target. A bloc with no usable signal abstains, which counts against passage. Whips decide how NPP blocs and party members vote on each stage (see [Voting & Whips](/wiki/voting-and-whips)).

## Removing a governor

The case starts at the conviction stage. A sitting member of that state's legislature files, and the legislature needs two-thirds of all its seats within 6 turns.

![Impeachment paths: lower chamber then upper chamber vote for a President, and a single two-thirds vote for a governor.](/wiki-images/diagrams/impeachment-process.svg)

| Item | Value |
| --- | --- |
| Lower chamber vote | 6 turns, strict majority of all seats (half plus one) |
| Upper chamber vote | 6 turns, two-thirds of all seats, rounded up |
| Governor vote | 6 turns, two-thirds of all state legislature seats |
| Re-filing cooldown | 48 turns (1 game year, 2 real days) against the same target |
| Active cases per target | 1 |

There is no action point or influence cost to file.

## When the numbers fall short

The US House has 435 seats and needs 218 for articles. A party holds 230 seats but only 200 of them vote. The articles fail, even with no Nay votes, because 200 is under 218. The next filing against the same President has to wait 48 turns. In the Senate of 100 seats, conviction needs 67. If 60 vote to convict and 40 vote against, the President stays, even though 60 percent voted yes.

Removing a President is meant to be hard to do by accident or on a thin turnout. Counting every seat means supporters have to turn up and the opposition can win by staying away.

## Where you fit in

- **File articles** if you hold a lower-chamber seat (President) or a state legislature seat (governor).
- **Vote** in the lower or upper chamber while a case is open.
- **Whip** your party's NPP blocs on the case before the window closes.
- **If you are the target:** keep your party's blocs loyal. They defend you, and every seat that does not vote helps you.

- **How do I impeach the President?** Hold a lower-chamber seat, file articles, then get 218 of 435 in the House followed by 67 of 100 in the Senate, each within 6 turns.
- **What happens after removal?** The seat is vacated and the Vice President takes over that turn.
- **How many votes do I need?** Strictly more than half of all seats for the lower chamber and two-thirds of all seats for the upper chamber or a governor.

It is not a no-confidence vote and not a Supreme Court case. Cabinet secretaries are removed by the President, not through this process.

Live in presidential countries such as the US. Parliamentary countries use no-confidence votes instead. Governor impeachment applies to presidential countries with state-level legislatures and governors.

Last checked 2026-10-29, version 1.18.0. Exact rules: the numbers on this page are the full rule set; the parliamentary counterpart is on the [Parliamentary government design page](https://docs.lakesidegames.net/design/parliamentary-government.html)
`;
