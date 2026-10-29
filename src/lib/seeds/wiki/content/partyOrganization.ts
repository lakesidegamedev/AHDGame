export const partyOrganizationContent = `# Party Organization

Nobody can take Org away from your party. A rival can only dilute your share by building their own, and you lose units only by neglect. Organization (**Org**) is your party's share of the machinery in a state: local offices, volunteers and loyal precinct captains. A higher share lifts your candidates' general election vote there, makes your GOTV spending go further, and counts toward becoming a Major party (see [Party Actions](/wiki/party-actions)). You raise it one click at a time with **Build Org**.

## Your share of a state

Each state or region has a shared Org pool made of units. Every party holds some units there. The pool also holds a permanent **Unaffiliated** stake of 100 units that never decays and cannot be spent.

\`\`\`
Org% = your units / (100 Unaffiliated units + every party's units) x 100
\`\`\`

Each successful Build Org click adds exactly **one unit** to your party. Because the pool gets bigger, every other party's percentage dips a little, but nobody loses units. A new party gains one unit per click just like an old one, but it cannot erase an old party's long lead with a few clicks. Each [party](/wiki/political-parties) holds its own share in each state.

A state has 100 Unaffiliated units, your party holds 40 units and a rival holds 60: your share is 40 / 200 = **20%**.

## Clicking Build Org

State chair, state vice chair, state campaigner, national chair, national vice chair and national campaigners can click Build Org ([Party Leadership](/wiki/party-leadership)). Treasurers cannot. The party must also have **presence** in the state: at least one member ([Party Membership](/wiki/party-membership)), elected official or active NPP homed there. No presence, no click, even for a national officer.

![Flow of one Build Org click through the presence check, who may click and whether the treasury covers a quarter of the price, then paying PS and money from one tier, adding one unit and recomputing shares.](/wiki-images/diagrams/party-organization-build-org-click.svg)

Every click costs **Political Strength** (PS) and **money**, both from the same level of the party, and the build panel shows the price before you click.

\`\`\`wiki-chart
build-org-click-cost
\`\`\`

- A state officer spends the state party's PS and the state treasury.
- A national officer spends the national pool and the national treasury. National clicks cost **twice** the money of state clicks.
- A fresh click costs 1 PS. Each click in the same state raises the next one by 1 PS, up to **8** (the *pressure ladder*). The ladder falls by 3 each turn. Another state is not affected.
- Money follows the PS cost: the price per PS point is a set amount per country, multiplied by the PS cost of the click and by a state-size factor.
- **Bigger states cost more** because one point of Org in a big state is worth more votes. The factor follows the square root of population and ranges from **0.5** in the smallest state to **2** in the largest, with the average state at 1.

If the treasury cannot cover the full price but covers at least **a quarter** of it, the click still adds one unit and takes whatever money is there. Below a quarter, the click is refused and costs nothing: no PS, no ladder rise.

The state treasury fills from member taxes, and the state party gains PS each turn (5 passive, more if the chair invests treasury money). Ask the state treasurer for a tax rate above 0, or ask the national party for a transfer.

You build five times in one turn. Your PS cost climbs 1, 2, 3, 4, 5 for 15 PS in total. Your money cost in an average US state is ₳2,813, ₳5,625, ₳8,438, ₳11,250 and ₳14,063: about **₳42,200** in all. You now have 45 units out of 205, a share of **22.0%**. If you had spread the same five clicks over five turns, you would have paid 1 PS each and about ₳14,100 in total, because the ladder drops by 3 a turn. Spacing out clicks is the cheap way to build.

| Item | Value |
| --- | --- |
| Units added per click | 1 |
| Unaffiliated stake | 100 units, permanent |
| PS cost of a fresh click | 1 |
| PS cost ceiling after repeated clicks | 8 |
| Pressure decay | 3 per turn |
| Money for a state click (US, average-size state, 1 PS) | ₳2,813 |
| Money for a national click (US, 1 PS) | ₳5,625 |
| State-size factor | 0.5 to 2 |
| Minimum treasury for a click to land | 25% of the price |
| Turns without a click before decay | 96 |
| Decay once it starts | 1% of units per turn |

## Letting it slip

A party that has not built in a state for **96 turns** starts losing units: **1% of its units per turn**, about 21% a day. Units halve in roughly 69 turns once decay starts. Any successful click resets the 96 turn clock for that state, so one click every 96 turns avoids decay. The Unaffiliated stake never decays.

\`\`\`wiki-chart
party-org-idle-decay
\`\`\`

## What Org buys you

In a [general election](/wiki/general-elections) your Org share is weighted with diminishing returns: the vote weight is \`orgShare ^ 0.2\`. A 3 to 1 lead in Org becomes only about a 1.25 to 1 edge in weight, and doubling your share adds about 15% to your vote weight. Org is one of several inputs, alongside candidate favorability and ideology. Primaries are unaffected, because everyone in a party's primary shares the same Org. Build where the election is tight; a point of Org in a big state is worth more but costs more.

How much do you need? There is no fixed number. A party that reaches **20% Org in a third of a country's regions** graduates to Major (a quarter in the UK), and that is the usual goal. The UK's regional parties are the other place it shows: Org decides how strong they are outside their home nation, see [Party Leadership & Authority](/wiki/party-leadership-authority).

Live in every world and country with parties and states or regions. Build Org is not available in a region that does not support party organization. Prices are quoted in each country's own currency. Last checked 2026-10-29, version 1.18.0. Exact rules: [Party Building design page](https://docs.lakesidegames.net/design/party-building.html)
`;
