export const congressLeadershipContent = `# Congress Leadership

Winning the Speaker's gavel is worth +3 actions every turn and a 2.0 national influence tier, and the House picks the Speaker by plurality in a single day. Congressional leadership (Speaker, floor leaders, whips) sits at the top of the US legislature, and holding a role also gives you the authority to whip your party's votes. This page covers who can run, who votes, and what happens when a seat goes empty.

## The ballot

Leadership elections are separate from constituency races. They are 24 hour plurality ballots: the candidate with the most votes when the window closes wins, with no majority needed. A tie goes to the candidate who declared first.

1. **A ballot opens** automatically after a House or Senate general election resolves, for each office that is vacant or whose holder's party is no longer the party that should hold it. An office whose holder still fits the new chamber is not reopened. The sitting holder is nominated automatically if they still hold a seat and still qualify. A resolved [general election](/wiki/general-elections) is what opens each new set of ballots.
2. **Members declare candidacy** during the window and members of the chamber vote. Declare from the Congress page, Leadership tab, which shows whether your party qualifies for each office and the voting deadline.
3. **The ballot closes** after 24 hours. The top vote-getter takes the office; the rest are marked failed.

U.S. congressional leadership races are player-only. NPPs do not run for, or vote in, Speaker, Majority Leader, Minority Leader or Pro Tempore ballots.

## Who can run and vote

| Office | Chamber | Who may declare and vote |
| --- | --- | --- |
| **Speaker of the House** | House | Any seated member of any party |
| **President Pro Tempore** | Senate | Members of the Senate's single largest party |
| **Majority Leader** | House and Senate | Members of the chamber's single largest party |
| **Minority Leader** | House and Senate | Members of parties outside the majority bloc |
| **Majority Whip** | House and Senate | Members of the chamber's single largest party |
| **Minority Whip** | House and Senate | Members of parties outside the majority bloc |

The **majority bloc** is the largest coalition or single party in the chamber; the minority bloc is the second largest. Coalition seats (see [Coalitions](/wiki/coalitions)) set that bloc, which decides who qualifies for majority and minority offices. Presiding-officer rules in other countries are on [Chamber Leadership](/wiki/chamber-leadership), which runs the same ballot framework.

![Eligibility tree for Speaker, Majority Leader and Minority Leader with a 435 seat example.](/wiki-images/diagrams/congress-leadership-eligibility.svg)

The Speaker belongs to the whole chamber, so every member votes. Majority offices belong to the party that controls the floor, so only that party picks them. Minority offices go to those who oppose it. Party-gated offices are also party-gated **tenure**: a sitting Pro Tempore, Majority Leader or Majority Whip who leaves the majority party loses the seat on the spot and a fresh 24 hour election opens. The same goes if your party is simply overtaken as the largest: the check runs every turn, so the seat is vacated within the hour and a fresh election opens for the new largest party.

Tips: win the Speaker race by being acceptable to both sides, since everyone votes; to hold a majority office keep your party the largest in the chamber, because losing that status can cost you the seat.

## What the offices pay

| Item | Value |
| --- | --- |
| Ballot length | 24 hours (24 turns), plurality, ties go to the earlier declaration |
| Motion to vacate the Speaker | Needs For votes from an absolute majority of all House seats: 218 of 435 |
| Extra actions per turn | Speaker +3; Majority and Minority Leaders +2; Pro Tempore +1; Whips +1 |
| National influence tier | Speaker, Majority Leader, Pro Tempore 2.0; Minority Leader 1.5; Whips none |

You get the highest single leadership action bonus you qualify for, not the sum. Influence tiers also do not stack with your other offices: you get your highest one (see [Elections Player Guide](/wiki/elections-player-guide)).

Whips can be issued by party chairs, vice chairs and chamber leaders; see [Voting & Whips](/wiki/voting-and-whips), where the leaders you elect here gain the authority to whip their party's members and NPPs. Senate floor leaders also organise the count and the abstention strategy on a [filibuster](/wiki/cloture-and-filibuster), and the Senate holds the [confirmation votes](/wiki/confirmation-process).

## A 435 seat House

Party A holds 230 seats, Party B holds 205. A is the single largest party, so A is the majority.

- **Speaker:** every seated member of A and B can run and vote.
- **Majority Leader:** only A's members can run and vote. B's members cannot.
- **Minority Leader:** only members of parties outside the majority bloc, here B, can run and vote.
- A Speaker who wins gets +3 actions per turn and a 2.0 influence tier. If B's members file a motion to vacate, 218 For votes are needed. B's 205 seats are not enough on their own, so they need 13 members from A or from NPP blocs that vote to remove the Speaker.

## Removing a Speaker

Any House member can file a motion to vacate, and any House member can vote For or Against. If it passes, the Speaker is removed immediately and a fresh Speaker election opens. If it fails, the Speaker stays. NPP blocs are given a vote when the window closes, and a seat that does not vote counts the same as a vote to keep the Speaker.

## When a chamber flips

When the largest party changes, the majority offices (Majority Leader, Majority Whip and, in the Senate, Pro Tempore) reopen for the new largest party. After every House or Senate election, each office is checked the same way: majority offices against the largest party, minority offices against the largest party in the minority bloc, and only an office that is vacant or held by the wrong party reopens. Senate election classes make no difference.

Live in the United States in every era. Other countries use the shared presiding-officer ballot described on [Chamber Leadership](/wiki/chamber-leadership); the UK, Japan and Germany add their own parliamentary offices on their country pages ([United Kingdom](/wiki/uk-overview), [Japan](/wiki/jp-overview)). Whips are elected on the same 24 hour ballots as the leaders.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Congress leadership design doc](https://docs.lakesidegames.net/design/congress-leadership.html)
`;
