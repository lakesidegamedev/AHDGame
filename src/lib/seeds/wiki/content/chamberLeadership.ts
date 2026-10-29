export const chamberLeadershipContent = `# Chamber Leadership

Every legislature elects a presiding officer, the member who chairs the chamber's sessions. The office pays extra actions and raises your national influence tier. Who can run and vote is not the same everywhere, so this page compares the US, Germany, Nigeria and China.

## How it works

All the presiding-officer ballots follow the same three steps.

1. **Open.** A 24 hour ballot opens once the chamber's seats are finalised after a general election. The sitting officer is nominated automatically if they still hold a seat and still qualify under the office's rule.
2. **Vote.** Eligible members declare candidacy and vote. Plurality wins, with no majority needed.
3. **Resolve.** When the ballot closes the top vote-getter wins and the others are marked failed. If there are no candidates, the seat stays vacant until the next election opens. If candidates tie, the one who declared first wins.

### Who can run: two rules

| Rule | Meaning | Offices |
| --- | --- | --- |
| **Any seated member** | Every party with at least one seat may run and vote. | US Speaker, German Bundestagspräsident, Nigerian Speaker and Senate President, China's NPCSC Chairman |
| **Largest single party only** | Only the chamber's biggest party may run and vote. | China's CPPCC Chairman |

Majority and Minority Leader are stricter and are covered on [Congress Leadership](/wiki/congress-leadership). Under "any seated member" bloc and party do not matter, though in practice the biggest party's numbers usually decide the result.

### Key numbers

| Item | Value |
| --- | --- |
| Ballot length | 24 hours in every country listed |
| Winning rule | Plurality; ties go to the earlier declaration |
| Bundestag seats | 487 in the 1953 preset, 630 in modern presets |
| Extra actions per turn | Speaker, Bundestagspräsident, NPCSC Chairman, Nigerian Speaker and Senate President +3; CPPCC Chairman +1 |
| National influence tier | +2.0 for the +3 offices; +1.5 for the CPPCC Chairman |

A member who holds several leadership roles takes the highest single action bonus, not the sum. The influence tier competes with your other offices: you get your single highest tier. See [Elections Player Guide](/wiki/elections-player-guide) for the full tier table.

### Worked example

The modern Bundestag has 630 seats and three candidates: A gets 250 votes, B gets 210, C gets 40, with the rest not voting. A wins with a plurality, even though 250 is fewer than the 316 of a majority. A gets +3 actions per turn and the +2.0 influence tier. If the vote were A 220 and B 220, whichever of the two declared first would win.

## What you can do

- **Declare candidacy** during the ballot and **vote**. The Leadership tab for your country's chamber shows the open ballot, eligibility and deadline.
- **Keep your seat.** An incumbent who loses their chamber seat (a House seat for the US Speaker, an NPC delegate seat for either Chinese chair) drops off the ballot even mid-term.
- **Watch the party rule.** A party that loses its majority status can knock its own incumbent off the ballot when the rule is party-gated.

### Country notes

**United States, Speaker of the House.** Presides over the House and sits second in the presidential line of succession. Any seated House member may declare and vote. The Speaker can be removed mid-term by a motion to vacate (see [Congress Leadership](/wiki/congress-leadership)).

**Germany, Bundestagspräsident.** Opens automatically once the Bundestag is filled through direct mandates and list seats. Any seated member may declare and vote.

**Nigeria.** Two officers are elected separately: the Speaker of the House of Representatives and the Senate President. Each ballot draws votes only from that chamber's members, so a House member cannot vote in the Senate President race.

**China.** Two chairs, both drawn from seated National People's Congress delegates. The NPCSC Chairman is open to any seated delegate. The CPPCC Chairman is restricted to the largest single party, the same rule as the US Majority Leader.

**Soviet Union.** The Chairman of the Presidium is elected by a joint sitting and looks like a presiding officer, but it is the ceremonial head of state and carries no action bonus or party-strength weight. It is not one of these ballots. See [Soviet Union](/wiki/ru-overview). The Supreme Soviet has no Majority or Minority Leader because the Communist Party is its only party.

## Connections

**Driven by**

- [General Elections](/wiki/general-elections): a resolved general election finalises the seats and opens the presiding-officer ballot.
- [Congress Leadership](/wiki/congress-leadership): the shared ballot framework and the eligibility rules come from the same system.
- [Coalitions](/wiki/coalitions): Coalitions: the majority bloc decides which parties can run for the minority posts.

**Affects**

- [Voting & Whips](/wiki/voting-and-whips): presiding officers who hold a leadership role may issue whips.
- [Elections Player Guide](/wiki/elections-player-guide): the office sets your national influence tier.

## Status

Live in the United States, Germany, Nigeria and China in every era. Bundestag size depends on the era (487 seats in the 1953 preset, 630 modern). Other countries elect presiding officers through their own offices; see the country pages. The Soviet Union has a separate Presidium chair, not covered here.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules and code layout: [Chamber leadership by country design doc](https://docs.lakesidegames.net/design/chamber-leadership-by-country.html).
`;
