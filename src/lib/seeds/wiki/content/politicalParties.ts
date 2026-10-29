export const politicalPartiesContent = `# Political parties

A party is the group you run, vote and legislate with. Primaries, bills, whips, coalitions and government formation all run through parties, so a character without one is an independent with far fewer tools. This page explains what a party is, how a new one is founded, and how to pick one.

## How it works

Each party belongs to one country. It has a name, an abbreviation, a colour, a treasury, a Political Strength reserve, and a position on a two-axis [ideology grid](/wiki/party-ideology) (economic and social, each from -5 to +5). Parties hold seats, run candidates in [primaries](/wiki/primaries), and spend shared resources through their leaders.

A party also has a footprint in every state or region. Each **state party** tracks its own members, [organization](/wiki/party-organization), treasury and leaders, so a party can be strong in one state and absent in the next.

**Party IDs.** Each party has a short number used in links, such as \`/parties/1?country=US\`. The number is only unique inside a country, so every party link carries the country.

### Built-in and custom parties

**Built-in parties** (for example Democratic and Republican in the US, Labour and Conservative in the UK) come with colours, historical positions and starting members. They cannot be deleted and are not created through a charter. In one-party states the built-in ruling party always counts as Major, and new parties start out banned; see [One-Party States](/wiki/one-party-states).

**Custom parties** are founded with a **party charter**. One player drafts it with the party name, abbreviation and a platform on both ideology axes. Exactly **3 human founders** must sign before the party exists. The two co-founders must live in the drafter's home state or a state next to it. This keeps a new party rooted in one area instead of appearing nationwide on day one.

Any founder can reject the charter. That opens a founder-replacement window, and the replacement must also live in or next to the drafter's home state.

### Key numbers

| Item | Value |
| --- | --- |
| Founders needed for a custom party | 3 human players |
| Where founders must live | Drafter's home state or a neighbouring state |
| Signing window and replacement window | The longer of 14 turns or 72 real hours, which is 72 turns at the standard hourly pace |
| Charter platform range | -60 to +60 per axis, scaled to the -5 to +5 party grid (divided by 12) |
| Delay before joining another party | 24 hours after your last join |
| Starting tier of a custom party | Minor (see [Party Actions](/wiki/party-actions)) |
| Empty custom party | Deleted automatically, unless it has a ratified charter |

### Worked example

Turn 1000: a player in Ohio drafts a charter with two co-founders, one from Ohio and one from Pennsylvania (a neighbour). The window runs until turn 1072. The Pennsylvania founder signs at turn 1010 and the Ohio founder at turn 1030. The drafter signs automatically, so the party is created at turn 1030, when the last co-founder signs. If the Ohio founder had instead rejected at turn 1030, a replacement window of the same length would have opened, and any replacement from Ohio or a neighbouring state could take the slot. If the window ends with fewer than three signatures, the charter expires and no party is created.

Platform example: a charter that sets +24 economic and -36 social starts the party at +2 economic and -3 social on the grid.

## What you can do

- **Browse parties.** Open \`/parties\`, pick a country, and open any party page. It shows ideology position, seats by office, the member list, leaders, state organization and treasury.
- **Join a party.** See [Party Membership](/wiki/party-membership) for the 24 hour delay, what happens to your races, and which parties you can reach.
- **Found a party.** Draft a charter from the parties page and invite two co-founders.
- **Merge or rename a party.** Committee proposals handle this; see [Party Leadership](/wiki/party-leadership).

**Choosing a party as a new player.** Match your character's two positions to the party's, because ideology is a large part of your [primary score](/wiki/party-ideology). Then check that the party is present in or next to your home state, and whether it has an active chair. Joining a built-in party with no chair makes you its chair. A large party gives you more NPP allies; a small one gives you more say in how it is run.

**Tips.**
- Line up your three founders before you draft. A charter only has the window above to collect signatures.
- A party with a ratified charter is safe from the empty-party cleanup. A custom party without one disappears once it has no members and no seats.
- If a party you belong to merges away, you move to the party it merged into; see [Party Leadership](/wiki/party-leadership).

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

## Connections

**Driven by**

- [Party Membership](/wiki/party-membership): a custom party with no members and no seats is deleted unless a ratified charter protects it.
- [NPPs Overview](/wiki/npps-overview): NPPs fill seats and offices in each party and keep it from being empty.
- [Election Mechanics](/wiki/election-mechanics): winners take office and shift party strength.
- [Relocation](/wiki/relocation): a move can end membership, reset Party Influence and vacate regional posts
- [Party Slate](/wiki/party-slate): chairs use the board to field candidates in each race.
- [One-Party States](/wiki/one-party-states): Regime tier limits what a party can do.

**Affects**

- [Party Membership](/wiki/party-membership): the party's footprint decides who may join, because you can only join a party present in or next to your home region.
- [Party Leadership](/wiki/party-leadership): every party has a national and a state leadership layer that runs it.
- [Party Organization](/wiki/party-organization): each party holds its own Org share in each state.
- [Party Ideology](/wiki/party-ideology): the charter platform sets the starting position on both axes.
- [Party Actions](/wiki/party-actions): the party's treasury and tier set the resources its leaders can spend.
- [Coalitions](/wiki/coalitions): only parties, not individuals, join coalitions.
- [primaries](/wiki/primaries): the party platform sets the alignment half of every primary score.
- [Demographics](/wiki/demographics): party GOTV budgets raise turnout of a chosen census bucket each turn.
- [Campaign Manager](/wiki/campaign-manager): party chairs and the treasurer can donate from the party treasury to candidates' campaigns.
- [fundraising-ads](/wiki/fundraising-ads): party tax comes out of your per-turn income, not Fundraise actions.
- [Relocation](/wiki/relocation): your party's reach decides whether you keep membership after a move
- [Core Systems](/wiki/core-systems): your party share of actions and the party tax on funds
- [Stats & Actions](/wiki/stats-actions): party share of actions and governing-party PI decay
- [Player Progression](/wiki/player-progression): primary access and leadership races depend on party membership
- [game-starting-state](/wiki/game-starting-state): default parties and their treasuries come from the opening seed
- [One-Party States](/wiki/one-party-states): A party's regime tier decides its powers; new parties in one-party states start banned.
- [Committees](/wiki/committees): A party's membership decides who stands and votes in its national committee election.

## Status

Live in every world and every country with elections. In one-party states a new party starts banned, and the ruling party is always Major. A party founded by charter is a custom party; built-in parties exist only in eras and countries where they existed.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Parties design page](https://docs.lakesidegames.net/design/parties.html).
`;
