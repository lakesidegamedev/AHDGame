export const deOverviewContent = `# Germany

No party has won an outright majority in Germany in decades, so the real game is coalition-building: you win a share of the Bundestag, then spend turns finding enough partners to get a Chancellor past a confidence vote. Germany is a **federal parliamentary republic** using **mixed-member proportional representation (AMS)**, and the Chancellor heads the government without being directly elected.

## Getting into the Bundestag

Germany's Bundestag uses the **Additional Member System (AMS)**, also called Mixed-Member Proportional (MMP). Each state elects constituency winners (direct mandates), and parties fill the rest of their seats from their lists. Seat allocation across the Bundestag is proportional to each party's vote share, so a party with 25% support gets roughly 25% of seats. This rewards consistent national support rather than geographic concentration. The chamber's size follows the era: **487 seats** in the 1953 preset (the 2nd Bundestag), **630** in every later preset. A party keeps every constituency it wins even where that is more than its proportional share in a Land, so those extra direct seats can push the chamber above its nominal size.

A party needs at least **5% of the national vote** or **3 direct mandates** to enter the Bundestag (the Sperrklausel threshold). Parties that meet neither condition receive no list seats, even if they win significant support in individual states; they keep only the one or two constituencies they won outright. Seats are shared out by the Sainte-Laguë method: each party's votes are divided by 1, 3, 5, 7 and so on, and the highest results win seats in order.

\`\`\`wiki-chart
de-vote-threshold-seats
\`\`\`

Take a 10-seat chamber and 1,000 votes: A 450, B 340, C 170, D 40. D is at 4% with no direct mandates, so it is out. The quotients are A 450, 150, 90, 64.3, 50; B 340, 113.3, 68; C 170, 56.7. The ten highest go to A (5), B (3) and C (2). If D had won 3 direct mandates, it would have been counted in despite its 4%.

Everything about the election cycle runs through [Election Mechanics](/wiki/election-mechanics), and [Campaign Strategy](/wiki/campaign-strategy) covers fundraising, ads and canvassing.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| Chancellor | Confidence vote of Bundestag members | No fixed term | 1 |
| Member of Bundestag (MdB) | Mixed-member proportional (AMS) | 4 years | 487 in the 1953 preset; 630 modern |
| Minister-President | Sub-national election | 5 years | 1 per state (11 in 1953 and 1979, 16 from 1991) |
| Member of a Landtag | Proportional (Sainte-Laguë) state election | 5 years | 1,901 across the 16 states from 1999 (1,987 in 1991, 1,429 in 1953 and 1979) |
| Federal President | Ceremonial (not player-facing) | Not modeled | 1 |
| President of the ECB | Nominated by the Chancellor, then drawn | 4 years | 1 |

## Seating a Chancellor

There is no direct vote for Chancellor. The process mirrors the UK's confidence mechanism:

1. After Bundestag elections, a party chair or coalition chair proposes a Chancellor from among their bloc's MdBs. The bloc needs at least one player MdB.
2. A **confidence vote** among Bundestag members confirms the Chancellor. It passes with more ayes than nays.
3. The coalition threshold is a bare majority of the chamber: 244 of 487 seats in the 1953 preset, 316 of 630 from 1979 on. A bloc at or above it forms a majority government; a party with 280 of 630 seats is 36 short and governs as a minority unless partners join.
4. **Minority government**: any party or coalition chair whose bloc holds at least about 15% of the Bundestag (97 of 630, 75 of 487) can propose a Chancellor and call a confidence vote, even when a rival bloc holds the majority. The Bundestag votes the bid up or down.

![Chancellor formation from the Bundestag election and entry gate through nomination and confidence vote, with a failed vote starting a 96-turn clock that ends in an automatic snap election.](/wiki-images/diagrams/de-overview-chancellor-formation.svg)

Coalition government is the default. The two major parties are **SPD** (Social Democrats, centre-left) and **CDU/CSU** (Christian Democrats, centre-right), but neither typically wins a majority alone. Common patterns:

- **Grand Coalition**: SPD + CDU/CSU (ideologically opposed parties governing together)
- **Traffic Light**: SPD + Greens + FDP
- **Jamaica**: CDU + Greens + FDP

In-game, coalition membership decides which bloc can propose a Chancellor and whose MdBs can be nominated. See [Government Formation](/wiki/government-formation) and [Coalition Formation](/wiki/coalition-formation) for how to negotiate one, and the [Cabinet Guide](/wiki/cabinet-guide) for every cabinet post.

**If nobody forms a government.** When the government is pending, a 96-turn clock (4 real days) runs. If no Chancellor is seated before it expires, a snap Bundestag election is triggered automatically.

## When a Chancellor falls or dissolves the house

The Chancellor serves as long as they hold the Bundestag's confidence. A majority government can last the full four-year legislative period without a confidence vote challenge.

In real-world Germany, removing a sitting Chancellor requires a **constructive vote of no confidence**: the Bundestag must simultaneously agree on a replacement before the incumbent can be voted out. *In-game, the simulation currently uses the same standard no-confidence mechanic as the UK and Japan*: a passed vote of no confidence sends the government into a pending state and the 96-turn vacancy clock arms. The constructive variant is not modeled. See [No-Confidence Votes](/wiki/no-confidence-votes).

**Snap elections.** As in the UK and Japan, the sitting Chancellor may dissolve the Bundestag and call a snap election. Snap windows are compressed (24h primary + 24h general) and run per Land. See [Snap Elections](/wiki/snap-elections) for the full mechanics.

The Bundestag also elects a presiding officer (**Bundestagspräsident**) from among MdBs. The role mirrors the US Speaker of the House mechanically: any seated MdB may declare and vote, the window runs 24 hours, and the top vote-getter wins. It is constitutionally distinct, though: the Bundestagspräsident ranks **second** in the German order of precedence after the Bundespräsident, and presides over Bundestag sessions, sets the agenda, and recognizes speakers. The **Federal President** is a ceremonial head of state (like the UK Monarch), not the head of government.

## The Länder and the Bundesrat

The 1953 and 1979 presets model West Germany: 11 federal states. From 1991 there are 16. Each state elects its own Minister-President, who is the sub-national executive equivalent to a US Governor.

The 11 states are: Baden-Württemberg, Bavaria, Berlin, Bremen, Hamburg, Hesse, Lower Saxony, North Rhine-Westphalia, Rhineland-Palatinate, Saarland, Schleswig-Holstein.

Germany's upper chamber is the **Bundesrat**, representing the states. In-game it has no members and casts no votes: players cannot sit in it, and a federal bill becomes law on a single Bundestag vote.

The five eastern states from reunified Germany (Brandenburg, Mecklenburg-Vorpommern, Saxony, Saxony-Anhalt, Thuringia) belong to East Germany (DD), which is a separate playable country in this era.

### If the East wins the German Question

The German Question can end the division. If the East wins the question (by a settlement on the diplomatic track, or by winning a war the question attached to), the Federal Republic is absorbed **into East Germany**, and the unified state is shown as Germany. The western Länder move across with their officeholders: MdBs become Volkskammer deputies, Landtag members become land assembly deputies, Minister-Presidents become Land First Secretaries, and the Federal President's office ends. East Berlin is folded into Berlin. The western parties cross over too, but the unified state is **one-party**: the SED governs beside its tolerated National Front partners, the western parties are banned, and the seats they hold are vacated. West Germany's cabinet loses its posts, the East keeps its own government, currency and economic system, and it takes over the West's law catalogue so the western Länder keep the laws they passed. The unified state sits in the Warsaw Pact, West Germany's NATO seat ends with it, and it deliberately calls **no election**. If the West wins, nothing is absorbed: the Federal Republic stays sovereign in NATO. See [One-Party States](/wiki/one-party-states) and [East Germany](/wiki/dd-overview).

![The two ways the German Question can end: an East win merges East Germany into a one-party Germany with no election, while a collapse leads to a parliamentary republic.](/wiki-images/diagrams/german-question-outcomes.svg)

## Where a German career starts

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Landtag member or Member of Bundestag (MdB) | +1 action/turn each; the Bundestag gives national legislature access |
| Mid-game | Minister-President | +2 actions/turn; controls state executive; assents to state bills |
| Top | Chancellor | +4 actions/turn; heads government; requires winning a Bundestag confidence vote |

The Landtag (state legislature, 5-year terms, +1 action per turn) is the sub-national entry rung, similar to a US State Senate seat. Bundestag seats are the bigger prize, so many new players start in a Landtag and move up. See [Player Progression](/wiki/player-progression) for the wider ladder.

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. The charter system is country-agnostic; DE-specific gates don't apply.

## The euro and the ECB

Germany's rate is set by the **ECB**, whose President is a player-held role that can be contested in-game. Ireland keeps its own central bank: the ECB sets its rate too only once a euro union is founded, which opens in 1999 and needs both Germany and Ireland to adopt the euro by law. Before a euro union exists, the 1953, 1979 and 1991 presets show German money as Deutsche Marks.

| Item | Detail |
| --- | --- |
| Currency | EUR |
| Central Bank | European Central Bank (ECB) |
| Chair title | President of the ECB |
| Default prime rate | 3.0% (4.0% opening rate in the 1991 preset) |
| Stock exchange | DAX |
| Finance Minister | Federal Minister of Finance |

## Living history

The timeline below is written by the turn processor whenever a national event happens in-game: a change of leader, a national law enacted, an alliance joined or left, a region transferred, or a settlement such as the German Question. Each entry is a real event from this save.

\`\`\`country-history
DE
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Playable in the 2027 preset; in every other era Germany runs as an economy preview, with its economy simulated but its offices closed to players. The 1953 preset is West Germany with 11 states and a 487-seat Bundestag; East Germany is then a separate country ([East Germany](/wiki/dd-overview)). Last checked 2026-10-30, version 1.18.0.
`;
