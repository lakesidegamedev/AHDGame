export const politicalPartiesContent = `# Political parties

Before you can stand in a primary, vote on a party-line bill or sit in a government, you have to answer one question: which party? Without one you are an independent with far fewer tools. This page covers what you are joining, how to pick, and how three players can found a new party from scratch.

## What a party is

Each party belongs to one country. It has a name, an abbreviation, a colour, a treasury, a Political Strength reserve, and a position on a two-axis [ideology grid](/wiki/party-ideology) (economic and social, each from -5 to +5). Parties hold seats, run candidates in [primaries](/wiki/primaries), and spend shared resources through their leaders. Who leads, and what they can do, is in [Party Leadership](/wiki/party-leadership).

A party also has a footprint in every state or region. Each **state party** tracks its own members, [organization](/wiki/party-organization), treasury and leaders, so a party can be strong in one state and absent in the next. That footprint matters to you directly: you can only join a party present in or next to your home region, and if you [relocate](/wiki/relocation) outside its reach you may lose membership and your Party Influence.

Each party has a short number used in links, such as \`/parties/1?country=US\`. The number is only unique inside a country, so every party link carries the country.

![Parties page with the party list, membership share balance of power and the Create party button](/wiki-images/screens/political-parties-parties-page.webp)

Open \`/parties\`, pick a country, and open any party page. It shows ideology position, seats by office, the member list, leaders, state organization and treasury. Parties also own the money you will notice first: party tax comes out of your per-turn income (not [Fundraise actions](/wiki/fundraising-ads)), and the party's share of your actions is part of [Core Systems](/wiki/core-systems) and [Stats & Actions](/wiki/stats-actions), where governing-party PI decay also lives.

## Picking a party

Match your character's two positions to the party's, because ideology is a large part of your [primary score](/wiki/party-ideology). Then check that the party is present in or next to your home state, and whether it has an active chair. Joining a built-in party with no chair makes you its chair. A large party gives you more NPP allies; a small one gives you more say in how it is run.

For the mechanics of joining, the 24 hour delay and what happens to your races, see [Party Membership](/wiki/party-membership). Primary access and leadership races both depend on membership, which is why [Player Progression](/wiki/player-progression) treats picking a party as an early step.

## Built-in and custom parties

**Built-in parties** (for example Democratic and Republican in the US, Labour and Conservative in the UK) come with colours, historical positions and starting members from the opening seed ([game-starting-state](/wiki/game-starting-state)), and exist only in eras and countries where they existed. They cannot be deleted and are not created through a charter. In one-party states the built-in ruling party always counts as Major, and new parties start out banned; a party's regime tier decides its powers, see [One-Party States](/wiki/one-party-states).

**Custom parties** are founded with a **party charter**, and they start at Minor tier (see [Party Actions](/wiki/party-actions)). One player drafts it with the party name, abbreviation and a platform on both ideology axes. Exactly **3 human founders** must sign before the party exists. The two co-founders must live in the drafter's home state or a state next to it. This keeps a new party rooted in one area instead of appearing nationwide on day one.

Any founder can reject the charter. That opens a founder-replacement window, and the replacement must also live in or next to the drafter's home state.

![Party charter flow: drafter and two co-founders sign, a rejection opens a replacement window, and an expired window ends the charter.](/wiki-images/diagrams/political-parties-charter-flow.svg)

| Item | Value |
| --- | --- |
| Founders needed for a custom party | 3 human players |
| Where founders must live | Drafter's home state or a neighbouring state |
| Signing window and replacement window | The longer of 14 turns or 72 real hours, which is 72 turns at the standard hourly pace |
| Charter platform range | -60 to +60 per axis, scaled to the -5 to +5 party grid (divided by 12) |
| Delay before joining another party | 24 hours after your last join |
| Starting tier of a custom party | Minor (see [Party Actions](/wiki/party-actions)) |
| Empty custom party | Deleted automatically, unless it has a ratified charter |

Turn 1000: a player in Ohio drafts a charter with two co-founders, one from Ohio and one from Pennsylvania (a neighbour). The window runs until turn 1072. The Pennsylvania founder signs at turn 1010 and the Ohio founder at turn 1030. The drafter signs automatically, so the party is created at turn 1030, when the last co-founder signs. If the Ohio founder had instead rejected at turn 1030, a replacement window of the same length would have opened, and any replacement from Ohio or a neighbouring state could take the slot. If the window ends with fewer than three signatures, the charter expires and no party is created.

Platform example: a charter that sets +24 economic and -36 social starts the party at +2 economic and -3 social on the grid.

Line up your three founders before you draft; the window above is all you get. A party with a ratified charter is safe from the empty-party cleanup, while a custom party without one disappears once it has no members and no seats (see [Party Membership](/wiki/party-membership)). If a party you belong to merges away, you move to the party it merged into; merges and renames go through committee proposals, see [Party Leadership](/wiki/party-leadership).

## What parties do once they exist

- [NPPs](/wiki/npps-overview) fill seats and offices in each party and keep it from being empty.
- [Election Mechanics](/wiki/election-mechanics): winners take office and shift party strength.
- Chairs use the [Party Slate](/wiki/party-slate) board to field candidates in each race, and the chair and treasurer can donate from the party treasury to candidates' campaigns through the [Campaign Manager](/wiki/campaign-manager).
- Party GOTV budgets raise turnout of a chosen census bucket each turn; see [Demographics](/wiki/demographics).
- The platform sets the alignment half of every [primary](/wiki/primaries) score, and the party's membership decides who stands and votes in its national [committee](/wiki/committees) election.
- Only parties, not individuals, join [coalitions](/wiki/coalitions).
- The party's treasury and tier set the resources its leaders can spend in [Party Actions](/wiki/party-actions).

## Parties by country

| Country | System | Key offices |
| --- | --- | --- |
| US | Presidential, first past the post | House, Senate, Governor, State Senate, President |
| UK | Westminster parliamentary | Commons, Regional Councils |
| DE | Mixed-member proportional | Bundestag, Minister-President |
| JP | Parliamentary, regional multi-seat | Shugiin, Sangiin, Governor |
| IE | Parliamentary, Hare-quota multi-seat | Dail, Cathaoirleach, Uachtaran |
| BR | Presidential, open-list proportional | Chamber, Senate, Governor, President |
| NG | Presidential, first past the post | House, Senate, State Assembly, Governor, President |
| CN, RU, DD and the Eastern bloc | One-party states | Ruling, approved and banned party tiers; see [One-Party States](/wiki/one-party-states) |

![Hub diagram with Political Parties in the centre, pages that drive it on the left and pages it affects on the right.](/wiki-images/diagrams/political-parties-connections.svg)

Live in every world and every country with elections. Last checked 2026-10-29, version 1.18.0. Exact rules: [Parties design page](https://docs.lakesidegames.net/design/parties.html)
`;
