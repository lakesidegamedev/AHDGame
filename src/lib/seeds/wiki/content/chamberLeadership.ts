export const chamberLeadershipContent = `# Chamber Leadership

Whoever chairs a chamber gets +3 actions a turn and a 2.0 national influence tier, and in most countries every seated member can compete for it. Every legislature elects a presiding officer, but who can run and vote is not the same everywhere, so this page compares the US, Germany, Nigeria and China.

## The ballot, step by step

All the presiding-officer ballots follow the same three steps.

1. **Open.** In the US, Germany and China a 24 hour ballot opens once the chamber's seats are finalised after a [general election](/wiki/general-elections), and the sitting officer is nominated automatically if they still hold a seat and still qualify under the office's rule. Nigeria's two ballots do not open on their own: an admin starts them, and nobody is nominated automatically.
2. **Vote.** Eligible members declare candidacy and vote. Plurality wins, with no majority needed. The Leadership tab for your country's chamber shows the open ballot, eligibility and deadline.
3. **Resolve.** When the ballot closes the top vote-getter wins and the others are marked failed. If there are no candidates, the seat stays vacant until the next election opens. A tie for the US Speaker goes to the candidate who declared first; for the other offices on this page the game sets no tie rule, so do not count on declaring early.

![A presiding officer ballot opens, votes and resolves, with eligibility depending on the office and the possible results.](/wiki-images/diagrams/chamber-leadership-ballot.svg)

The shared ballot framework and eligibility rules come from the same system as [Congress Leadership](/wiki/congress-leadership).

## Who gets to run

| Rule | Meaning | Offices |
| --- | --- | --- |
| **Any seated member** | Every party with at least one seat may run and vote. | US Speaker, German Bundestagspräsident, Nigerian Speaker and Senate President, China's NPCSC Chairman |
| **Largest single party only** | Only the chamber's biggest party may run and vote. | China's CPPCC Chairman |

Majority and Minority Leader are stricter and are covered on [Congress Leadership](/wiki/congress-leadership). Under "any seated member" bloc and party do not matter, though in practice the biggest party's numbers usually decide the result. (When the majority bloc matters, it is set by [Coalitions](/wiki/coalitions), which decides which parties can run for the minority posts.)

Two things can knock an incumbent off the ballot. One who loses their chamber seat (a House seat for the US Speaker, an NPC delegate seat for either Chinese chair) drops off even mid-term. And a party that loses its majority status can knock its own incumbent off when the rule is party-gated.

## What the chair pays

| Item | Value |
| --- | --- |
| Ballot length | 24 hours in every country listed |
| Winning rule | Plurality; US Speaker ties go to the earlier declaration, other offices have no tie rule |
| Bundestag seats | 487 in the 1953 preset, 630 in every later preset |
| Extra actions per turn | Speaker, Bundestagspräsident, NPCSC Chairman, Nigerian Speaker and Senate President +3; CPPCC Chairman +1 |
| National influence tier | +2.0 for the +3 offices; +1.5 for the CPPCC Chairman |

A member who holds several leadership roles takes the highest single action bonus, not the sum. The influence tier competes with your other offices: you get your single highest tier. See [Elections Player Guide](/wiki/elections-player-guide) for the full tier table. The US Speaker and President Pro Tempore may also issue whips (see [Voting & Whips](/wiki/voting-and-whips)); the German, Nigerian and Chinese presiding officers cannot.

The modern Bundestag has 630 seats and three candidates: A gets 250 votes, B gets 210, C gets 40, with the rest not voting. A wins with a plurality, even though 250 is fewer than the 316 of a majority. A gets +3 actions per turn and the +2.0 influence tier. If the vote were A 220 and B 220, the game has no tie rule for this office, so either could be declared the winner.

## Country by country

**United States, Speaker of the House.** Presides over the House. Any seated House member may declare and vote. The Speaker can be removed mid-term by a motion to vacate (see [Congress Leadership](/wiki/congress-leadership)).

**Germany, Bundestagspräsident.** Opens automatically once the Bundestag is filled through direct mandates and list seats. Any seated member may declare and vote.

**Nigeria.** Two officers are elected separately: the Speaker of the House of Representatives and the Senate President. An admin opens and closes each ballot. Each ballot draws votes only from that chamber's members, so a House member cannot vote in the Senate President race.

**China.** Two chairs, both drawn from seated National People's Congress delegates. The NPCSC Chairman is open to any seated delegate. The CPPCC Chairman is restricted to the largest single party, the same rule as the US Majority Leader.

**Soviet Union.** The Chairman of the Presidium looks like a presiding officer, but it is the ceremonial head of state and carries no action bonus or party-strength weight. It is not one of these ballots. See [Soviet Union](/wiki/ru-overview). The Supreme Soviet has no Majority or Minority Leader; those offices exist only in the US Congress.

Live in the United States, Germany, Nigeria and China in every era. Bundestag size depends on the era (487 seats in the 1953 preset, 630 in every later preset). Other countries elect presiding officers through their own offices; see the country pages. The Soviet Union has a separate Presidium chair, not covered here.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Chamber leadership by country design doc](https://docs.lakesidegames.net/design/chamber-leadership-by-country.html)
`;
