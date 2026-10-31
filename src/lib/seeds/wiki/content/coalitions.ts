export const coalitionsContent = `# Coalitions

Allying with another party can lock you out of the minority leadership posts. In the US, a coalition adds its parties' seats into one bloc, and the largest bloc counts as the majority when chamber leaders are chosen. In parliamentary countries a coalition's combined seats count when a government is formed, and everywhere a coalition can agree shared priorities. Coalitions are run by party chairs, not by individual players: you belong to a [party](/wiki/political-parties), and your party's chair speaks and votes for it.

## What a coalition is

Each coalition has:

- a **name** (3 to 60 characters, unique in the country) and an **abbreviation** (2 to 10 characters)
- a **colour** used on cards and charts
- a **chair party**, and a **chair**: that party's national chair
- a list of **member parties**, each with its join date

A party can be in **only one** coalition at a time, and a coalition only holds parties from its own country. The national chair creates, joins and leaves for the party ([Party Leadership](/wiki/party-leadership)), and an acting vice chair can do the same when the chair seat is empty ([Party Leadership & Authority](/wiki/party-leadership-authority)). In a one-party state only the ruling party can form or join one ([One-Party States](/wiki/one-party-states)). The steps for creating, joining and leaving are in [Coalition Formation](/wiki/coalition-formation), and invites, join requests and votes reach chairs as [notifications](/wiki/notifications).

The coalition chair is the national chair of the chair party. If that party leaves, the longest-standing member party takes over.

To see coalitions, go to \`/parties\`, switch from the Parties tab to the Coalitions tab and pick a country. A coalition page has Overview (averaged positions, leaders, any disband vote), Parties, Priorities, and a Chair's Office for the chair.

![Coalition page with members, ideology and the list of member parties and their chairs](/wiki-images/screens/coalitions-coalition-page.webp)

## Blocs and who may lead the chamber

A coalition lets smaller parties pool seats into one bigger bloc. For [chamber leadership](/wiki/chamber-leadership) the game adds up the seats of every party in a coalition to form a **bloc**. A party outside any coalition is its own bloc. The largest bloc in a chamber is the **majority bloc**; the second largest is the **minority bloc**. That bloc, not its biggest party, is what counts as the majority when the minority posts are assigned.

Bloc size does not give a bloc everything. Each leadership role has its own rule, and eligibility for Majority and Minority Leader and Whip follows them ([Congress Leadership](/wiki/congress-leadership)):

| Role | Who can run and vote |
| --- | --- |
| Majority Leader and Whip (House, Senate) | Only the single largest **party**, not the bloc |
| President Pro Tempore (Senate) | Only the single largest party |
| Minority Leader and Whip (House, Senate) | Any party **outside** the majority bloc |
| Speaker of the House, Bundestagspraesident | Any party with a seat; blocs do not matter |

So a coalition does not hand its members the Majority Leader seat. It does remove them from contention for Minority Leader and Whip, because they are in the majority bloc. A coalition whip can also direct its members in a contingent House presidential election.

![US House example where parties B and C form a 210 seat bloc, showing which parties may run for Majority Leader, Minority Leader and Speaker.](/wiki-images/diagrams/coalitions-bloc-example.svg)

The US House has 435 seats: Party A 180, Party B 150, Party C 60, Party D 45. Before any coalition, A is the largest bloc and B, C, D are not in its bloc. B and C form a coalition: its bloc is 150 + 60 = **210 seats**, now larger than A's 180. The majority bloc is now B+C, so:

- Majority Leader and Whip: still the largest single party, which is **A** (180), not B (150).
- Minority Leader and Whip: any party outside B+C, which means **A or D**.
- Speaker: open to A, B, C and D.

The coalition changed who counts as the minority, not who holds the Majority Leader seat. Check the bloc maths before you ally: the largest bloc can lock the smaller party out of minority posts. If a party leaves mid-term, the bloc is recounted from current members. A leader whose party no longer qualifies loses the post; for example a Pro Tempore who leaves the largest party is removed.

## Shared priorities

Coalitions also let parties agree up to three **shared priorities** (a bill, a policy theme or a leadership goal). Each member party's chair votes support, oppose or abstain, and a priority goes active when more than half of the member parties support it. The coalition page shows a cohesion label (Strong, Mixed, Fractured or Unaligned) from those votes. Priorities are a signal; they do not force members to vote any way.

Outside the US chambers, coalitions matter in parliamentary government formation (the UK, Germany, Japan, Ireland and other parliamentary countries). A coalition chair can propose a prime minister, the coalition's combined seats decide whether that government counts as a majority or a minority, a coalition government's support is recounted from its live membership, and the largest opposition coalition's chair can be the opposition leader; see [Government Formation](/wiki/government-formation).

| Item | Value |
| --- | --- |
| Name length | 3 to 60 characters |
| Abbreviation length | 2 to 10 characters |
| Coalitions per party | 1 |
| Active shared priorities | Up to 3 |
| Votes to activate a priority | More than half of member parties |
| Disband vote length | 24 turns (24 hours at the standard pace) |
| Yes votes needed to disband | More than half of all member parties |

Bloc effects apply to US House and Senate leadership; parliamentary countries use coalitions in government formation instead. Same in every era and world that has parties. Last checked 2026-10-30, version 1.18.0. Exact rules: [Coalitions design page](https://docs.lakesidegames.net/design/coalitions.html)
`;
