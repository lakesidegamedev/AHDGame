export const deOverviewContent = `# Germany

No party has won an outright majority in Germany in decades, so the real game is coalition-building: you win a share of the Bundestag, then spend turns finding enough partners to get a Chancellor past a confidence vote. Germany is a **federal parliamentary republic** using **mixed-member proportional representation (AMS)**, and the Chancellor heads the government without being directly elected.

## Getting into the Bundestag

Germany's Bundestag uses the **Additional Member System (AMS)**, also called Mixed-Member Proportional (MMP). Each state elects constituency winners (direct mandates), and parties fill the rest of their seats from their lists. Seat allocation across the Bundestag is proportional to each party's vote share, so a party with 25% support gets roughly 25% of seats. This rewards consistent national support rather than geographic concentration. The chamber's size follows the era: **487 seats** in the 1953 preset (the 2nd Bundestag), **630** in the modern one, where the 2023 reform fixed the size with no overhang mandates.

A party needs at least **5% of the national vote** or **3 direct mandates** to enter the Bundestag (the Sperrklausel threshold). Parties that meet neither condition receive no seats, even if they win significant support in individual states. Seats are shared out by the Sainte-Laguë method: each party's votes are divided by 1, 3, 5, 7 and so on, and the highest results win seats in order.

\`\`\`wiki-chart
de-vote-threshold-seats
\`\`\`

Take a 10-seat chamber and 1,000 votes: A 450, B 340, C 170, D 40. D is at 4% with no direct mandates, so it is out. The quotients are A 450, 150, 90, 64.3, 50; B 340, 113.3, 68; C 170, 56.7. The ten highest go to A (5), B (3) and C (2). If D had won 3 direct mandates, it would have been counted in despite its 4%.

Everything about the election cycle runs through [Election Mechanics](/wiki/election-mechanics), and [Campaign Strategy](/wiki/campaign-strategy) covers fundraising, ads and canvassing.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| Chancellor | Confidence vote of Bundestag members | No fixed term | 1 |
| Member of Bundestag (MdB) | Mixed-member proportional (AMS) | 4 years | 487 in the 1953 preset; 630 modern |
| Minister-President | Sub-national election | 5 years | 1 per state (11 in 1953, 16 modern) |
| Member of a Landtag | Proportional (Sainte-Laguë) state election | 5 years | 1,901 across the 16 modern states |
| Federal President | Ceremonial (not player-facing) | 5 years | 1 |
| President of the ECB | Appointed action | 4 years | 1 |

## Seating a Chancellor

There is no direct vote for Chancellor. The process mirrors the UK's confidence mechanism:

1. After Bundestag elections, the largest party or coalition with a majority negotiates government formation.
2. A **confidence vote** among all Bundestag members confirms the Chancellor.
3. The coalition threshold is a bare majority of the chamber: 244 of 487 seats in the 1953 preset, 316 of 630 in the modern one. A party with 280 of 630 seats needs 36 votes from outside its ranks.
4. **Minority government**: any party or coalition chair holding a sizeable bloc of Bundestag seats can propose a Chancellor and call a confidence vote, even when a rival bloc holds the majority. The Bundestag votes the bid up or down.

![Chancellor formation from the Bundestag election and entry gate through nomination and confidence vote, with a failed vote starting a 96-turn clock that ends in an automatic snap election.](/wiki-images/diagrams/de-overview-chancellor-formation.svg)

Coalition government is the default. The two major parties are **SPD** (Social Democrats, centre-left) and **CDU/CSU** (Christian Democrats, centre-right), but neither typically wins a majority alone. Common patterns:

- **Grand Coalition**: SPD + CDU/CSU (ideologically opposed parties governing together)
- **Traffic Light**: SPD + Greens + FDP
- **Jamaica**: CDU + Greens + FDP

In-game, coalition mechanics determine which party controls the Chancellor's office and how cabinet seats are distributed across coalition partners. See [Government Formation](/wiki/government-formation) and [Coalition Formation](/wiki/coalition-formation) for how to negotiate one, and the [Cabinet Guide](/wiki/cabinet-guide) for every cabinet post.

**If nobody forms a government.** When the government is pending, a 96-turn clock (4 real days) runs. If no Chancellor is seated before it expires, a snap Bundestag election is triggered automatically.

## When a Chancellor falls or dissolves the house

The Chancellor serves as long as they hold the Bundestag's confidence. A majority government can last the full four-year legislative period without a confidence vote challenge.

In real-world Germany, removing a sitting Chancellor requires a **constructive vote of no confidence**: the Bundestag must simultaneously agree on a replacement before the incumbent can be voted out. *In-game, the simulation currently uses the same standard no-confidence mechanic as the UK and Japan*: a passed vote of no confidence sends the government into a pending state and the 96-turn vacancy clock arms. Modeling the constructive variant is a future enhancement. See [No-Confidence Votes](/wiki/no-confidence-votes).

**Snap elections.** As in the UK and Japan, the sitting Chancellor may dissolve the Bundestag and call a snap election. Snap windows are compressed (24h primary + 24h general) and run per Land. See [Snap Elections](/wiki/snap-elections) for the full mechanics.

The Bundestag also elects a presiding officer (**Bundestagspräsident**) by simple majority among MdBs. The role mirrors the US Speaker of the House mechanically: open declarations from majority-bloc MdBs, a 24-hour voting window, and a plurality winner. It is constitutionally distinct, though: the Bundestagspräsident ranks **second** in the German order of precedence after the Bundespräsident, and presides over Bundestag sessions, sets the agenda, and recognizes speakers. The **Federal President** is a ceremonial head of state (like the UK Monarch), not the head of government.

## The Länder and the Bundesrat

The 1953 preset models West Germany: 11 federal states. Modern presets have 16. Each state elects its own Minister-President, who is the sub-national executive equivalent to a US Governor.

The 11 states are: Baden-Württemberg, Bavaria, Berlin, Bremen, Hamburg, Hesse, Lower Saxony, North Rhine-Westphalia, Rhineland-Palatinate, Saarland, Schleswig-Holstein.

Germany's upper chamber is the **Bundesrat**, representing the states. Its members are appointed by state governments, not elected by players directly, so as Minister-Presidents win and lose elections, the Bundesrat's composition shifts. The Bundesrat can delay or block certain categories of legislation, particularly those affecting state responsibilities.

The five eastern states from reunified Germany (Brandenburg, Mecklenburg-Vorpommern, Saxony, Saxony-Anhalt, Thuringia) belong to East Germany (DD), which is a separate playable country in this era.

### If the East wins the German Question

The German Question can end the division. If the East wins the question (by a settlement on the diplomatic track, or by winning a war the question attached to), East Germany is absorbed into a single Germany and the East arrives **intact**: the Volkskammer's members take their places in the Bundestag, land assemblies become Landtage, Land First Secretaries become Minister-Presidents, East Berlin is folded into Berlin, and the eastern parties cross over as real parties with their treasuries, registration and members. Seats carried across are rescaled onto the delegation the Bundestag already holds for the five eastern Länder rather than adding a whole second chamber. The unified state is **one-party**, with the parties of the East governing and the western parties barred, it inherits the East's law catalogue alongside its own, it leaves NATO as it joins the Warsaw Pact, and it deliberately calls **no election**: the chamber that was just carried across is the point of the settlement. See [One-Party States](/wiki/one-party-states) and [East Germany](/wiki/dd-overview).

![The two ways the German Question can end: an East win merges East Germany into a one-party Germany with no election, while a collapse leads to a parliamentary republic.](/wiki-images/diagrams/german-question-outcomes.svg)

## Where a German career starts

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Landtag member or Member of Bundestag (MdB) | +1 action/turn each; the Bundestag gives national legislature access |
| Mid-game | Minister-President | +2 actions/turn; controls state executive; Bundesrat influence |
| Top | Chancellor | +4 actions/turn; heads government; requires Bundestag majority |

The Landtag (state legislature, 5-year terms, +1 action per turn) is the sub-national entry rung, similar to a US State Senate seat. Bundestag seats are national contests, so many new players start in a Landtag and move up. See [Player Progression](/wiki/player-progression) for the wider ladder.

Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. The charter system is country-agnostic; DE-specific gates don't apply.

## The euro and the ECB

Germany uses the **Euro (EUR)** and shares the **ECB** with other Eurozone countries. The ECB's prime rate (shared across all EU member countries in-game) is set by the ECB President, a role that can be contested in-game.

| Item | Detail |
| --- | --- |
| Currency | EUR |
| Central Bank | European Central Bank (ECB) |
| Chair title | President of the ECB |
| Default prime rate | 3.0% |
| Stock exchange | DAX |
| Finance Minister | Chancellor of Finance (Finanzminister) |

## Living history

The timeline below is written by the turn processor whenever a Chancellor transition or federal-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
DE
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Playable in every era. The 1953 preset is West Germany with 11 states and a 487-seat Bundestag; East Germany is then a separate country ([East Germany](/wiki/dd-overview)). Last checked 2026-10-29, version 1.18.0.
`;
