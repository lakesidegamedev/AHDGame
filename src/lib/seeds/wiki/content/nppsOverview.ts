export const nppsOverviewContent = `# NPPs overview

Most of the people you vote beside, run against and need on side are not players. Non-Player Politicians (NPPs) are computer-run politicians. In the US House, which has 435 seats, a few dozen active players cannot fill it, so most seats belong to NPPs. You cannot give an NPP orders, but you can influence how it feels about you and, through your party, who it backs.

![Map of NPPs with the pages that drive them on the left and the pages they affect on the right.](/wiki-images/diagrams/npps-overview-connections.svg)

## Who they are

Each NPP has:

- a generated **name** and a **home state** (a region in the UK, a Land in Germany, a prefecture in Japan)
- a **party** and **policy positions** on the economic and social axes (-5 to +5), the same grid as [Party Ideology](/wiki/party-ideology)
- a **personality**: loyalty, ambition and stubbornness, each 0 to 100
- a **donor base level** from 0 to 10 (it starts at 1)
- **Political Influence** (0 to 100, never below **10**) and **favorability** (0 to 100)

An "NPP" badge marks them everywhere. Their pages are on the state, Congress, election and bill pages. Generated NPPs start from the opening seeds. New characters start with the same Political Influence floor of 10 that NPPs have.

## What they do for the world

NPPs fill every office players do not hold, which keeps every party's seats and offices from standing empty ([Political Parties](/wiki/political-parties)). They:

1. **Vote on bills.** Each seat is a vote, so an NPP holding 7 House seats casts 7 votes. Their combined votes supply most of the votes on each bill in [Bills & Legislation](/wiki/bills-legislation), and often decide whether it passes. Loyalty, stubbornness, donors and home state feed the voting forces; see [NPP Behavior](/wiki/npp-behavior) and [voting-and-whips](/wiki/voting-and-whips).
2. **Run in elections.** They are your automatic opponents in primaries and general elections. Home state and a fixed order of race types decide which race an NPP enters, and at higher [NPP Autonomy](/wiki/npp-autonomy) levels ambition also sends some NPPs to challenge or climb; see [NPP Elections](/wiki/npp-elections).
3. **Do not choose US congressional leaders.** Speaker and floor leader races are for players only; NPPs vote in them only when a player's whip directs them.

Rules that never change:

- **Presidents.** NPPs cannot run for President in a country players are enabled in. In a country nobody plays and where NPP autonomy is on, they can. How much NPPs do on their own depends on the world's level; see [NPP Autonomy](/wiki/npp-autonomy).
- **One per party per primary, by default.** A party's generic NPPs fill a primary with at most one candidate, so they do not split their own vote. A slated NPP, or at higher NPP autonomy levels an occasional ambitious challenger, can add a second. An incumbent NPP gets first claim on defending its seat.
- **Country isolation.** US NPPs run in US races only, UK NPPs in UK races only.

## How many a party can field

Parties get a limited number of NPPs of their own, based on **active members** (a member who took at least 2 game actions in the last 14 days; see [Party Membership](/wiki/party-membership)). The first 5 active members add 5 slots each, the next 5 add 4 each, members up to 20 add 3 each, and later members add 2 each. A country ceiling of **6 NPPs per region** applies, with a minimum ceiling of 25.

| Active members | NPP slots |
| --- | --- |
| 4 | 20 |
| 8 | 37 |
| 20 | 75 |
| 30 | 95 |

\`\`\`wiki-chart
npp-capacity-by-members
\`\`\`

The party controls show the current count and capacity. The ceiling is 300 in a 50-state country and 72 in the 12-region UK. Chairs recruit, steer and slate NPPs with the party's resources; see [Party Actions](/wiki/party-actions). Whips are in [Voting & Whips](/wiki/voting-and-whips).

## Working on one NPP

From an NPP's profile at \`/politicians/npp/[id]\` you can spend actions and money to move its feelings ([Political Capital](/wiki/political-capital) covers what actions and funds pay for, and [Stats & Actions](/wiki/stats-actions) the stat changes). These are fixed outcomes, not dice rolls. The relationship and favorability gains below are for average Charisma; Charisma scales gains by up to 20% either way.

| Action | Actions | Funds | Minimum relationship | Effect |
| --- | --- | --- | --- | --- |
| Request Endorsement | 6 | ₳0 | See below | Endorses your current campaign in that race |
| Private Meeting | 3 | ₳0 | -50 | +5 relationship |
| Boost Favorability | 5 | ₳10,000 | none | +3 favorability, +2 relationship |
| Reduce Favorability | 5 | ₳10,000 | -100 | -3 favorability, -2 relationship |
| Boost Influence | 6 | ₳20,000 | none | +2 political influence, +2 relationship |
| Reduce Influence | 6 | ₳20,000 | -100 | -2 political influence, -2 relationship |

**The endorsement gate.** An NPP accepts an endorsement request only if your relationship with it is at least **40 plus the combined economic and social gap between your positions, up to 10**. So an NPP that matches you perfectly needs a relationship of 40, and one 10 or more points away needs 50. The profile shows only "Likely to Accept" or "Likely to Decline". The endorsement lasts only for the race you asked about, and it adds campaign actions per turn to the campaign it backs ([Campaign Manager](/wiki/campaign-manager)). Relationships also drift back toward neutral by 0.1 a turn, so keep up contact.

You want an endorsement from an NPP whose positions are +2 economic and -1 social. Yours are +3 and -2. The gap is 1 + 1 = 2, so you need a relationship of **42**. Your relationship is 30. Two Private Meetings (+5 each, 6 actions) bring it to 40; two Boost Favorability actions (+2 relationship each, 10 actions, ₳20,000) bring it to 44. Now Request Endorsement (6 actions) is "Likely to Accept". Total: 22 actions and ₳20,000.

You cannot pick who an NPP votes for, order one to sponsor a bill, or choose which race an NPP enters. Only your party's leaders can steer those, through whips and slates. An NPP has not voted on your bill if it has not opened yet: NPPs vote only while a bill is open, once each, and abstain when the pressures nearly cancel.

Live in every world and country. Presidential races are open to NPPs only in countries nobody plays. Last checked 2026-10-30, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html)
`;
