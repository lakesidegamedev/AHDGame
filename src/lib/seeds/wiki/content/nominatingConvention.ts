export const nominatingConventionContent = `# Presidential Nominating Convention

A presidential primary does not end on a single score. States vote in [staggered waves](/wiki/primaries) that hand out **pledged delegates**, and those delegates settle the nomination. If nobody wins a clear majority, the party holds a multi-ballot convention that drops the last-placed candidate round by round until someone has one. If you are in the race, the convention is where a close primary is really decided, and where who you have endorsed (or who likes your politics) matters.

## When nobody has a majority

Once every primary wave has voted, a party's nomination resolves one of three ways:

1. **First-ballot majority.** If one candidate holds a delegate majority, they are nominated outright and no convention is held.
2. **Contested convention.** If no one holds a majority, a multi-ballot convention runs. This applies to races on the reworked rules, which means the 1964 cycle onward.
3. **Plurality (older races).** Races that opened under the older rules, including the 1960 race, skip the convention. The delegate leader is nominated even without a majority.

Delegates come from the [primary waves](/wiki/primaries), so the convention only matters when those waves leave nobody over the line. Every tie along the way is broken the same fixed way: more delegates, then more national primary votes, then candidate id. There is no randomness.

### Ballot by ballot

1. Each ballot counts the delegates currently pledged to every candidate still standing.
2. If the leader holds a majority of the delegates in play, they are nominated and the convention ends. It also ends when one candidate is left.
3. Otherwise the **last-placed candidate is eliminated** and their delegates are released to the survivors.

Delegates are always handed out as whole numbers and always add up to exactly what was released. Because one candidate leaves every inconclusive ballot, the convention always ends.

![Flowchart of convention ballots: a leader with a delegate majority is nominated, otherwise the last-placed candidate drops and their delegates are released before the next ballot.](/wiki-images/diagrams/nominating-convention-ballots.svg)

### Where a dropped candidate's delegates go

A dropped candidate's delegates do not split evenly. Each survivor gets a share weighted by:

- **Affinity:** how close the survivor is to the dropped candidate in economic and social positions (70% of the measure) and in which voter groups each party's candidate appeals to (30%). A closer survivor gets more. It is the same measure used for [suspend-and-endorse transfers](/wiki/running-mate-surrogate).
- **Endorsement:** an extra 0.5 weight for any survivor the dropped candidate had actively endorsed. It is sized to tip a close release without overriding ideology.

If every weight is zero and there is no endorsement, the delegates split as evenly as possible.

### The numbers

| Item | Value |
| --- | --- |
| Delegates needed | floor(total delegates / 2) + 1 |
| Democratic delegates, modern roster | 3,889 (1,945 needed) |
| Republican delegates, modern roster | 2,490 (1,246 needed) |
| Extra release weight for an endorsed survivor | 0.5 |
| Ideology share of affinity | 70% |
| Voter-group share of affinity | 30% |
| Conventions run for | 1964 cycle onward |

Each state's delegate count is the 2020 table, rescaled when an era's electoral votes for that state differ, with a minimum of 1.

### Four candidates, three ballots

Say four candidates reach the convention in a 3,889-delegate Democratic race, so 1,945 delegates are needed. These numbers are illustrative.

| Ballot | A | B | C | D | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 1,400 | 1,150 | 900 | 439 | No majority. D is last and is dropped. |
| 2 | 1,500 | 1,370 | 1,019 | out | No majority. C is dropped. |
| 3 | 1,800 | 2,089 | out | out | B holds 2,089 and is nominated. |

D's 439 delegates went 100 to A, 220 to B and 119 to C, because B was closest to D. C's 1,019 went 300 to A and 719 to B. Although A led on the first two ballots, a weaker-placed rival who is closer to the eliminated candidates can overtake.

## Playing for the convention

- **Win delegates in the waves.** Anything that helps you in a state helps here too: [Campaign Presence](/wiki/political-operations), favorability and [polling](/wiki/polling). Whoever comes out on top is named as the nominee in the [General Elections](/wiki/general-elections).
- **Endorse a rival.** An active endorsement adds weight to your choice if you are eliminated, but you cannot hand delegates to a chosen candidate directly.
- **Watch the delegate tracker** on the presidential primary race page to see where you stand against the majority.
- **Position yourself.** If you are likely to finish mid-pack, being ideologically close to the leaders gets you delegates when others drop.

Tips:

- A lead that is short of a majority is not a nomination. Plan for the convention, not just the waves.
- Nominees who withdraw do not choose where their delegates go. Affinity and endorsement decide.

Live for US presidential races from the 1964 cycle onward. Older races, including 1960, name the delegate leader without a convention. Other countries do not use delegates. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html)
`;
