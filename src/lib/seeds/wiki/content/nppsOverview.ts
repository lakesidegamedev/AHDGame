export const nppsOverviewContent = `# NPPs overview

Non-Player Politicians (NPPs) are computer-run politicians. They hold seats, run in primaries and general elections, and vote on bills every turn, so the world works even when few players are online. You cannot give an NPP orders, but you can influence how it feels about you and, through your party, who it backs.

## How it works

### What an NPP is

Each NPP has:

- a generated **name** and a **home state** (a region in the UK, a Land in Germany, a prefecture in Japan)
- a **party** and **policy positions** on the economic and social axes (-5 to +5)
- a **personality**: loyalty, ambition and stubbornness, each 0 to 100
- a **donor base level** from 0 to 5
- **Political Influence** (0 to 100, never below **10**) and **favorability** (0 to 100)

An "NPP" badge marks them everywhere. Their pages are on the state, Congress, election and bill pages.

### Why they matter

NPPs fill every office players do not hold. In the US House, which has 435 seats, a few dozen active players cannot fill it, so most seats belong to NPPs. They:

1. **Vote on bills.** Each seat is a vote, so an NPP holding 7 House seats casts 7 votes. Their combined votes often decide whether a bill passes. See [NPP Behavior](/wiki/npp-behavior).
2. **Run in elections.** They are your automatic opponents in primaries and general elections. See [NPP Elections](/wiki/npp-elections).
3. **Do not choose US congressional leaders.** Speaker and floor leader races are for players only; NPPs vote in them only when a player's whip directs them.

### How many NPPs a party can field

Parties get a limited number of NPPs of their own, based on **active members** (a member who took at least 2 game actions in the last 14 days). The first 5 active members add 5 slots each, the next 5 add 4 each, members up to 20 add 3 each, and later members add 2 each. A country ceiling of **6 NPPs per region** applies, with a minimum ceiling of 25.

| Active members | NPP slots |
| --- | --- |
| 4 | 20 |
| 8 | 37 |
| 20 | 75 |
| 30 | 95 |

\`\`\`wiki-chart
npp-capacity-by-members
\`\`\`

The party controls show the current count and capacity. The ceiling is 300 in a 50-state country and 72 in the 12-region UK.

### Rules that never change

- **Presidents.** NPPs cannot run for President in a country players are enabled in. In a country nobody plays and where NPP autonomy is on, they can.
- **One per party per primary.** A party's generic NPPs never split their own vote in a primary. An incumbent NPP gets first claim on defending its seat.
- **Country isolation.** US NPPs run in US races only, UK NPPs in UK races only.

### Influencing one NPP

From an NPP's profile you can spend actions and money to move its feelings. These are fixed outcomes, not dice rolls.

| Action | Actions | Funds | Minimum relationship | Effect |
| --- | --- | --- | --- | --- |
| Request Endorsement | 6 | ₳0 | See below | Endorses your current campaign in that race |
| Private Meeting | 3 | ₳0 | -50 | +5 relationship |
| Boost Favorability | 5 | ₳10,000 | none | +3 favorability, +2 relationship |
| Reduce Favorability | 5 | ₳10,000 | -100 | -3 favorability, -2 relationship |
| Boost Influence | 6 | ₳20,000 | none | +2 political influence, +2 relationship |
| Reduce Influence | 6 | ₳20,000 | -100 | -2 political influence, -2 relationship |

**The endorsement gate.** An NPP accepts an endorsement request only if your relationship with it is at least **40 plus the combined economic and social gap between your positions, up to 10**. So an NPP that matches you perfectly needs a relationship of 40, and one 10 or more points away needs 50. The profile shows only "Likely to Accept" or "Likely to Decline". The endorsement lasts only for the race you asked about. Relationships also drift back toward neutral by 0.1 a turn, so keep up contact.

### Worked example

You want an endorsement from an NPP whose positions are +2 economic and -1 social. Yours are +3 and -2. The gap is 1 + 1 = 2, so you need a relationship of **42**. Your relationship is 30. Two Private Meetings (+5 each, 6 actions) bring it to 40; two Boost Favorability actions (+2 relationship each, 10 actions, ₳20,000) bring it to 44. Now Request Endorsement (6 actions) is "Likely to Accept". Total: 22 actions and ₳20,000.

## What you can do

- **Open an NPP's profile** at \`/npp/[id]\` and use the actions above.
- **Work through your party:** chairs can recruit, steer and slate NPPs; see [Party Actions](/wiki/party-actions).
- **Whip them** on bills; see [Voting & Whips](/wiki/voting-and-whips).

**What you cannot do.** You cannot pick who an NPP votes for, order one to sponsor a bill, or choose which race an NPP enters. Only your party's leaders can steer those, through whips and slates.

**Common questions.**
- *Why has an NPP not voted on my bill?* NPPs vote only while a bill is open, once each, and abstain when the pressures nearly cancel. A bill that has not opened yet has no NPP votes.
- *Can I get NPPs to run?* Party chairs can slate them; see [NPP Elections](/wiki/npp-elections).
- *Do NPPs get stronger over time?* Only through the autonomy level your world uses; see [NPP Autonomy](/wiki/npp-autonomy).

## Connections

**Driven by**

- [Party Membership](/wiki/party-membership): each active member raises the party's NPP capacity.
- [Party Actions](/wiki/party-actions): recruitment and management spend party resources to add and steer NPPs.
- [NPP Autonomy](/wiki/npp-autonomy): the world's level decides how much NPPs do on their own.
- [Political Capital](/wiki/political-capital): your actions and funds pay for profile influence.
- [Stats & Actions](/wiki/stats-actions): NPP direct actions change NPP favorability, influence and relationship

**Affects**

- [NPP Behavior](/wiki/npp-behavior): loyalty, stubbornness and donors shape how an NPP votes and answers whips.
- [NPP Elections](/wiki/npp-elections): ambition and home state decide which race an NPP enters.
- [Political Parties](/wiki/political-parties): NPPs fill a party's seats and offices and keep it from standing empty.
- [Bills & Legislation](/wiki/bills-legislation): NPP seats supply most votes on each bill.
- [Campaign Manager](/wiki/campaign-manager): NPP endorsements add campaign actions per turn to the campaign they back.
- [voting-and-whips](/wiki/voting-and-whips): NPP loyalty, stubbornness, donors and home state feed the voting forces and whip response.

## Status

Live in every world and country. How much NPPs do on their own depends on the world's autonomy level, and presidential races are open to NPPs only in countries nobody plays. New characters start with the same Political Influence floor of 10 that NPPs have.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html).
`;
