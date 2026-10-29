export const partyLeadershipContent = `# Party Leadership

Every party is run by three officers: a **chair**, a **vice chair** and a **treasurer**. They exist at two levels, national and per state. Officers spend the party's money and Political Strength, whip NPPs, and decide how the party changes through committee votes. This page covers who holds each seat, what it allows, and how the committee changes the party.

## How it works

### The seats and what they allow

| Role | National party | State party |
| --- | --- | --- |
| **Chair** | Form and manage coalitions, whip nationally, recruit NPPs, click Build Org anywhere, set taxes and budgets | Whip NPPs in the state, set budgets, click Build Org in the state |
| **Vice chair** | Same as the chair for whips and most actions; acts as chair if the seat is empty | Same whip and budget powers as the state chair |
| **Treasurer** | Manage the national treasury and set the national tax rate | Set the state tax rate and manage the state treasury |

Only some powers are shared by all three. Budget percentages (GOTV, suppression, registration drive) can be set by the chair, vice chair, treasurer or the national chair. Whips are for the chair and vice chair, plus chamber leaders such as Speaker or whip. Details on each action are on [Party Actions](/wiki/party-actions).

### How people get a seat

- **Elections.** National and state seats are filled by member votes. A national election is open whenever none is running for that seat; the default length is **72 turns**, though a race that starts mid-cycle may run shorter so every party votes on the same cycle. State elections also run **72 turns** and open when a seat is vacant. Each voter casts one vote. The most votes wins, and a tie goes to the candidate who entered first.
- **Who can run or vote.** Members with at least **24 turns** in the party. See [Party Leadership & Authority](/wiki/party-leadership-authority). Brand new world-start elections are shorter (12 turns) and skip that rule.
- **Empty built-in parties.** Joining a built-in party that has no chair makes you its chair.
- **Vice chair as chair.** If the chair seat is empty and a vice chair is in place, the vice chair acts as chair.
- **UK leader challenges.** In UK parties, MPs can also file a leadership challenge against the sitting leader.

Leaving or switching parties vacates your seats.

### The national committee

The **national committee** is up to **6** members elected by party members (each voter can vote for up to 6 candidates; the election runs 168 turns). It sits beside the three officers and votes on proposals. The chair, vice chair and any committee member can propose; the treasurer can vote but cannot propose. A merge can only be proposed by the chair.

### Key numbers

| Item | Value |
| --- | --- |
| Leadership election length (national default, state) | 72 turns by default |
| National election length when a proposal sets it | 168 to 420 turns |
| Tenure before you can run or vote | 24 turns |
| Committee size | Up to 6 members |
| Proposal voting window | 24 turns |
| Votes needed to pass | 60% of filled voting seats, rounded up |
| After a proposal passes, that type is locked for | 96 turns |
| After a position shift passes, that axis is locked for | 336 turns |
| Position shift size | 1 step on one axis, kept inside -5 to +5 |

### How a proposal is decided

The voters are the committee members plus the chair, vice chair and treasurer. Empty seats are not counted. The proposal passes the moment yes votes reach **60%** of those voters, rounded up. It fails early as soon as too many have voted no for the rest to reach that number. If the 24 turns end first, every voter who did not vote counts as a **no**, so a proposal that nobody votes on always fails.

**Worked example.** A party has 6 committee members, a chair, a vice chair and a treasurer, all different people: 9 voters. Yes needs 60% of 9, which is 5.4, rounded up to **6**. The chair proposes a rename. Five vote yes, one votes no, three do not vote. At turn 24 the nonvoters count as no, 5 is below 6, and the proposal fails. With 6 yes it would have passed immediately. If 4 voters vote no, it fails at once, since only 5 yes votes remain possible.

### Proposal types

| Type | Effect |
| --- | --- |
| Rename | Changes the party name and abbreviation |
| Position shift | Moves the economic or social position by 1 step. The axis is locked for 336 turns afterwards; the two axes are tracked separately |
| Election method | All members vote (default), only committee and officers vote, or all members vote with votes weighted by political influence in the party |
| Election duration | Sets how long national leadership elections run, 168 to 420 turns |
| Merge | Folds your party into another party in the same country |

Other proposal types (such as campaigner nominations and treasury approval rules) use the same voting rule.

### Merging

A merge needs a yes from **both** committees, each under the 60% rule. It is only allowed when the two parties already overlap or touch in at least one region. If it passes:

| What | What happens |
| --- | --- |
| Players | Move to the target party. Their party influence is halved |
| NPPs | Move over, but the target keeps all its own NPPs first and a region cannot go over its NPP limit; the weakest incoming NPPs beyond that limit are removed |
| National treasury | All of it goes to the target |
| State organization | Half of each state's Org units are added to the target's Org in that state |
| Your party | Marked defunct. It stays visible with a "dissolved" notice but nobody can join it |

## What you can do

- **Whip NPPs** on a bill or a leadership vote from the party page. Chairs and vice chairs can whip nationally, state officers can whip NPPs in their state, and chamber leaders can whip in their chamber. Whipping is free. Hard whips roll once per NPP, soft whips add pressure. Full rules: [Voting & Whips](/wiki/voting-and-whips) and [NPP Behavior](/wiki/npp-behavior).
- **Set budgets and tax.** Done from the party's treasury page; see [Party Actions](/wiki/party-actions).
- **Build Org.** Officers click Build Org; see [Party Organization](/wiki/party-organization).
- **Propose and vote** in the Committee Proposals section of the party's committee tab. You can change your vote while the proposal is open, and officers see the live counts.
- **Run for a seat.** Declare when an election opens, after 24 turns in the party.

**Tips.**
- Count your voters before you propose. Missing votes count as no, so a proposal needs real turnout, not just a majority of those who show up.
- A position shift is slow on purpose: one step, then a 336 turn lock on that axis.
- Check the cooldown before you plan a rename or a duration change; a passed type is locked for 96 turns.

## Connections

**Driven by**

- [Party Membership](/wiki/party-membership): members vote in leadership elections once they have 24 turns of tenure.
- [Party Leadership & Authority](/wiki/party-leadership-authority): the tenure gate and the acting chair rule decide who can run and who holds chair powers.
- [Political Parties](/wiki/political-parties): every party has a national and a state leadership layer.
- [Committees](/wiki/committees): Elected committee members propose and vote on party changes.

**Affects**

- [Party Membership](/wiki/party-membership): officers set the tax rate and accept or decline requests in approval-only parties.
- [Party Actions](/wiki/party-actions): officers choose how Political Strength, treasury money and budgets are spent.
- [Party Organization](/wiki/party-organization): only officers can click Build Org.
- [Party Ideology](/wiki/party-ideology): a passed position shift moves the party one step on one axis.
- [Coalitions](/wiki/coalitions): the national chair creates, joins and leaves coalitions for the party.
- [Coalition Formation](/wiki/coalition-formation): the national chair is the one who invites, requests, kicks, transfers and starts disband votes.
- [NPP Behavior](/wiki/npp-behavior): whips from officers add pressure to NPP bill votes.
- [Voting & Whips](/wiki/voting-and-whips): officers hold the whip powers that page describes.
- [Committees](/wiki/committees): The party committee is elected by party members.

## Status

Live in every world and country with parties. Chamber leader whips apply where the country has those offices, and the UK adds the leader challenge.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Parties design page](https://docs.lakesidegames.net/design/parties.html) and the [Party Whips design page](https://docs.lakesidegames.net/design/party-whips.html).
`;
