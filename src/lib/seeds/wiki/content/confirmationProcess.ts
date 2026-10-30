export const confirmationProcessContent = `# Confirmation Process

A presidential nominee is only as good as the Senate count. NPP senators vote strictly by party, so the real fight is over player senators and whips. A nominee needs a strict majority of Confirm over Reject inside 24 hours, and a tie fails.

## A nomination, vote by vote

1. **Nomination.** The President nominates a character for a specific seat (see [Cabinet](/wiki/cabinet), where each seat's nomination is what opens a confirmation vote). This creates a pending nomination. Only one can be pending per seat, so the President must wait for it to resolve or withdraw it.
2. **Senate vote opens** for 24 hours. Every sitting Senator (player or NPP) can vote Confirm, Reject or Abstain. Abstentions are neutral.
3. **NPP senators vote automatically** by party (see below).
4. **The window closes** and the votes are tallied.
   - More Confirm than Reject: the nominee takes office, replaces any acting secretary and the seat is filled.
   - More Reject than Confirm: the nomination fails and the seat stays vacant. The President can nominate again at once. A failed nomination has no cooldown.
   - A tie fails. Confirmation needs a strict majority, and there is no Vice President tie-break on these votes.

![A nomination goes to a 24 hour Senate vote; more Confirm than Reject confirms, a tie or more Reject fails, and the President can withdraw.](/wiki-images/diagrams/confirmation-process-vote-flow.svg)

Pending nominations appear on the executive dashboard for the President, and open votes appear on the Senate floor tracker alongside bills.

## What needs a Senate vote

- All Cabinet seats, except the White House Chief of Staff, whom the President appoints alone with no Senate vote.
- Supreme Court justices, who use the same NPP party-line behavior (see [Supreme Court](/wiki/scotus)).
- Federal Reserve chair and governors, voted on from the FOMC committee page (see [FOMC / Rate-Setting Board](/wiki/fomc) and [central-banks](/wiki/central-banks)). The Senate confirms anyone the President puts on the FOMC board; a vacant Fed chair seat can also be filled by the chair draw on Central Banks.
- A Vice President nomination to fill a vacancy needs both the Senate and the House: each chamber must pass it with a strict majority.

Parliamentary countries (UK, Japan, Germany) have no Senate confirmation. The Prime Minister or Chancellor appoints cabinet members directly. See [Government Formation](/wiki/government-formation).

## How NPP senators vote

| Item | Value |
| --- | --- |
| Vote window | 24 hours |
| Pass rule | Confirm votes strictly greater than Reject votes; a tie fails |
| Pending nominations per seat | 1 |
| NPP senator, same party as the nominee | Always Confirm |
| NPP senator, opposite major party to the nominee | Always Reject |
| NPP senator from the President's party (otherwise) | 70% Confirm, 30% Abstain |
| Any other NPP senator | 55% Confirm, 45% Reject |
| NPP with no party | Abstain |

Seat counts weigh the vote: an NPP bloc holding several seats casts its full seat count.

NPP senators ignore favorability, loyalty and policy alignment on confirmations. Only party matters. The two major blocs never cross the aisle against each other's nominee, while independents and minor parties vote partly at random, so an independent or minor-party nominee can pick up a few extra votes. The party that controls the Senate (see [Congress Leadership](/wiki/congress-leadership)) decides most outcomes.

### Counting a close one

A 100 seat Senate: 52 Republican NPP or player seats, 46 Democratic, 2 independent. A Republican President nominates a Republican. If every Republican seat votes Confirm and every Democratic seat votes Reject, the vote is 52 to 46 with the 2 independents split at random (55% Confirm each). The nominee passes. If one Republican player senator crosses over, it is 51 to 47 and still passes. If three do, it is 49 to 49 plus independents, and a pure tie fails, so the last two seats decide it.

## Playing the vote

- **As President:** nominate, withdraw a nomination before the vote closes (this returns the seat to vacant without a formal rejection), or bridge a vacancy with a 24-turn acting appointment. A nominee the Senate has rejected cannot be installed as acting for the same seat.
- **As a senator:** vote Confirm, Reject or Abstain. Whip your party's NPP bloc by issuing a directive before the vote opens, the same way you do on a bill; a party whip on the nomination moves NPP and player senator votes (see [Voting & Whips](/wiki/voting-and-whips)).
- **As a nominee:** the party label matters most to NPPs. Win goodwill from player senators, who decide for themselves.

Strategy:

- **President:** in divided government, pick a confirmable candidate and time a controversial nomination for after new senators are seated. Offering a seat to a player in the other party can buy legislative support.
- **Senate:** blocking a nominee forces the President to negotiate. Target the seats that matter, such as State and Treasury.
- **Leaving a seat vacant** avoids a confirmation fight but leaves no department head and costs approval.

Can't nominate someone? You are not the President, the seat already has a nomination pending, the seat does not exist in the current year, or the nominee holds an office that cannot be combined with it.

Applies in the United States in every era. Other countries do not use Senate confirmation. Vice President nominations also need the House.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Cabinet design page](https://docs.lakesidegames.net/design/cabinet.html)
`;
