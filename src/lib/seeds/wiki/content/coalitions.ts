export const coalitionsContent = `# Coalitions

A coalition is an alliance of parties inside one country. In the US it decides which parties count as the opposition when chamber leaders are chosen. Everywhere else it is a way to show unity and agree shared priorities. Coalitions are run by party chairs, not by individual players.

## How it works

Each coalition has:

- a **name** (3 to 60 characters, unique in the country) and an **abbreviation** (2 to 10 characters)
- a **colour** used on cards and charts
- a **chair party**, and a **chair**: that party's national chair
- a list of **member parties**, each with its join date

A party can be in **only one** coalition at a time, and a coalition only holds parties from its own country. You belong to a party, not to the coalition. Your party's chair speaks and votes for it.

### Blocs and chamber leaders

For chamber leadership the game adds up the seats of every party in a coalition to form a **bloc**. A party outside any coalition is its own bloc. The largest bloc in a chamber is the **majority bloc**; the second largest is the **minority bloc**.

Bloc size does not give a bloc everything. Each leadership role has its own rule:

| Role | Who can run and vote |
| --- | --- |
| Majority Leader and Whip (House, Senate) | Only the single largest **party**, not the bloc |
| President Pro Tempore (Senate) | Only the single largest party |
| Minority Leader and Whip (House, Senate) | Any party **outside** the majority bloc |
| Speaker of the House, Bundestagspraesident | Any party with a seat; blocs do not matter |

So a coalition does not hand its members the Majority Leader seat. It does remove them from contention for Minority Leader and Whip, because they are in the majority bloc. A coalition whip can also direct its members in a contingent House presidential election.

![US House example where parties B and C form a 210 seat bloc, showing which parties may run for Majority Leader, Minority Leader and Speaker.](/wiki-images/diagrams/coalitions-bloc-example.svg)

### Why it exists

A coalition lets smaller parties pool seats into one bigger bloc. That bloc, not its biggest party, is what counts as the majority when the minority posts are assigned. Coalitions also let parties agree up to three **shared priorities** (a bill, a policy theme or a leadership goal). Each member party's chair votes support, oppose or abstain, and a priority goes active when more than half of the member parties support it. The coalition page shows a cohesion label (Strong, Mixed, Fractured or Unaligned) from those votes. Priorities are a signal; they do not force members to vote any way.

Outside the US, coalitions are signalling only. UK, German, Japanese and Irish governments are built by their own government formation step, which does not consult these alliances; see [Government Formation](/wiki/government-formation).

### Key numbers

| Item | Value |
| --- | --- |
| Name length | 3 to 60 characters |
| Abbreviation length | 2 to 10 characters |
| Coalitions per party | 1 |
| Active shared priorities | Up to 3 |
| Votes to activate a priority | More than half of member parties |
| Disband vote length | 24 turns (24 hours at the standard pace) |
| Yes votes needed to disband | More than half of all member parties |

### Worked example

The US House has 435 seats: Party A 180, Party B 150, Party C 60, Party D 45. Before any coalition, A is the largest bloc and B, C, D are not in its bloc. B and C form a coalition: its bloc is 150 + 60 = **210 seats**, now larger than A's 180. The majority bloc is now B+C, so:

- Majority Leader and Whip: still the largest single party, which is **A** (180), not B (150).
- Minority Leader and Whip: any party outside B+C, which means **A or D**.
- Speaker: open to A, B, C and D.

The coalition changed who counts as the minority, not who holds the Majority Leader seat.

## What you can do

- **See coalitions.** On \`/parties\`, switch from the Parties tab to the Coalitions tab and pick a country. A coalition page has Overview (averaged positions, leaders, any disband vote), Parties, and a Chair's Office for the chair.
- **Create, join or leave.** See [Coalition Formation](/wiki/coalition-formation). Your party's national chair does this, or the vice chair if the chair seat is empty.
- **Agree priorities** with the other chairs from the coalition page.
- **Check the bloc maths** before you ally: the largest bloc can lock the smaller party out of minority posts.

**Common questions.**
- *Who is the coalition chair?* The national chair of the chair party. If that party leaves, the longest-standing member party takes over.
- *Do coalitions matter in the UK or Germany?* Not for forming governments. They still show alignment and shared priorities.
- *What happens if a party leaves mid-term?* The bloc is recounted from current members. A leader whose party no longer qualifies loses the post; for example a Pro Tempore who leaves the largest party is removed.

## Connections

**Driven by**

- [Political Parties](/wiki/political-parties): only parties join coalitions.
- [Party Leadership](/wiki/party-leadership): the national chair creates, joins and leaves coalitions for the party.
- [Party Leadership & Authority](/wiki/party-leadership-authority): an acting vice chair can act for the party in its coalition.
- [Coalition Formation](/wiki/coalition-formation): who is in the coalition changes the bloc totals.
- [One-Party States](/wiki/one-party-states): Only the ruling party can form or join a coalition in a one-party state.

**Affects**

- [Chamber Leadership](/wiki/chamber-leadership): the majority bloc decides who may run for the minority posts.
- [Congress Leadership](/wiki/congress-leadership): Majority and Minority Leader and Whip eligibility follows the bloc rules.
- [Coalition Formation](/wiki/coalition-formation): the one coalition per party rule and chair powers shape each step.
- [Notification Center](/wiki/notifications): invites, join requests and votes arrive as notifications
- [Government Formation](/wiki/government-formation): Coalition chairs can nominate a PM and bring partner seats to the vote.

## Status

Bloc effects apply to US House and Senate leadership. In every other country coalitions are signalling only. They work the same way in every era and world that has parties.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Coalitions design page](https://docs.lakesidegames.net/design/coalitions.html).
`;
