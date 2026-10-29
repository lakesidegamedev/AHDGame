export const confirmationProcessContent = `# Confirmation Process

In the US, the Senate must confirm presidential nominations before a nominee can take office. The vote runs for 24 hours and a strict majority of Confirm over Reject wins. NPP senators vote along party lines, so the real fight is over player senators and whips.

## How it works

1. **Nomination.** The President nominates a character for a specific seat. This creates a pending nomination. Only one can be pending per seat, so the President must wait for it to resolve or withdraw it.
2. **Senate vote opens** for 24 hours. Every sitting Senator (player or NPP) can vote Confirm, Reject or Abstain. Abstentions are neutral.
3. **NPP senators vote automatically** by party (see below).
4. **The window closes** and the votes are tallied.
   - More Confirm than Reject: the nominee takes office and the seat is filled.
   - More Reject than Confirm: the nomination fails and the seat stays vacant. The President can nominate again at once.
   - A tie fails. Confirmation needs a strict majority, and there is no Vice President tie-break on these votes.

![A nomination goes to a 24 hour Senate vote; more Confirm than Reject confirms, a tie or more Reject fails, and the President can withdraw.](/wiki-images/diagrams/confirmation-process-vote-flow.svg)

### What needs confirmation

- All Cabinet seats (see [Cabinet](/wiki/cabinet)), except the White House Chief of Staff, whom the President appoints alone with no Senate vote.
- Supreme Court justices, who use the same NPP party-line behavior (see [Supreme Court](/wiki/scotus)).
- Federal Reserve chair and governors, voted on from the FOMC committee page (see [FOMC / Rate-Setting Board](/wiki/fomc)).
- A Vice President nomination to fill a vacancy needs both the Senate and the House: each chamber must pass it with a strict majority.

Parliamentary countries (UK, Japan, Germany) have no Senate confirmation. The Prime Minister or Chancellor appoints cabinet members directly. See [Government Formation](/wiki/government-formation).

### Key numbers

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

### How NPP senators vote

NPP senators ignore favorability, loyalty and policy alignment on confirmations. Only party matters. The two major blocs never cross the aisle against each other's nominee, while independents and minor parties vote partly at random, so an independent or minor-party nominee can pick up a few extra votes.

### Worked example

A 100 seat Senate: 52 Republican NPP or player seats, 46 Democratic, 2 independent. A Republican President nominates a Republican. If every Republican seat votes Confirm and every Democratic seat votes Reject, the vote is 52 to 46 with the 2 independents split at random (55% Confirm each). The nominee passes. If one Republican player senator crosses over, it is 51 to 47 and still passes. If three do, it is 49 to 49 plus independents, and a pure tie fails, so the last two seats decide it.

## What you can do

- **As President:** nominate, withdraw a nomination before the vote closes (this returns the seat to vacant without a formal rejection), or bridge a vacancy with a 24-turn acting appointment. A confirmed nominee replaces the acting secretary the moment the Senate votes. A nominee the Senate has rejected cannot be installed as acting for the same seat.
- **As a senator:** vote Confirm, Reject or Abstain. Whip your party's NPP bloc by issuing a directive before the vote opens, the same way you do on a bill (see [Voting & Whips](/wiki/voting-and-whips)).
- **As a nominee:** the party label matters most to NPPs. Win goodwill from player senators, who decide for themselves.

Pending nominations appear on the executive dashboard for the President, and open votes appear on the Senate floor tracker alongside bills.

### Why can't I nominate someone?

You are not the President, the seat already has a nomination pending, the seat does not exist in the current year, or the nominee holds an office that cannot be combined with it.

### Strategy

- **President:** in divided government, pick a confirmable candidate and time a controversial nomination for after new senators are seated. Offering a seat to a player in the other party can buy legislative support.
- **Senate:** blocking a nominee forces the President to negotiate. Target the seats that matter, such as State and Treasury.
- **Leaving a seat vacant** avoids a confirmation fight but leaves no department head and costs approval.

A failed nomination has no cooldown.

## Connections

**Driven by**

- [Voting & Whips](/wiki/voting-and-whips): a party whip on the nomination moves NPP and player senator votes.
- [Cabinet](/wiki/cabinet): each cabinet seat's nomination is what opens a confirmation vote.
- [Congress Leadership](/wiki/congress-leadership): the party that controls the Senate decides most outcomes.

**Affects**

- [Cabinet](/wiki/cabinet): a confirmed nominee fills the seat and replaces any acting secretary.
- [Supreme Court](/wiki/scotus): justices are confirmed through the same Senate process.
- [central-banks](/wiki/central-banks): The Senate confirms Federal Reserve board seats.
- [fomc](/wiki/fomc): The Senate decides who sits on the FOMC board.

## Status

Live in the United States in every era. Other countries do not use Senate confirmation. Vice President nominations also need the House.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules for the nomination vote are on the [Cabinet design page](https://docs.lakesidegames.net/design/cabinet.html).
`;
