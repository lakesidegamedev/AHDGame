export const partyOrganizationContent = `# Party Organization

Organization (**Org**) is your party's share of the party machinery in a state: local offices, volunteers and loyal precinct captains. A higher share lifts your candidates' general election vote in that state, makes your GOTV spending go further, and counts toward becoming a Major party. You raise it one click at a time with **Build Org**.

## How it works

Each state or region has a shared Org pool made of units. Every party holds some units there. The pool also holds a permanent **Unaffiliated** stake of 100 units that never decays and cannot be spent.

\`\`\`
Org% = your units / (100 Unaffiliated units + every party's units) x 100
\`\`\`

Each successful Build Org click adds exactly **one unit** to your party. Because the pool gets bigger, every other party's percentage dips a little, but nobody loses units. A new party gains one unit per click just like an old one, but it cannot erase an old party's long lead with a few clicks.

### What a click costs

Every click costs **Political Strength** (PS) and **money**, both from the same level of the party.

- A state officer spends the state party's PS and the state treasury.
- A national officer spends the national pool and the national treasury. National clicks cost **twice** the money of state clicks.
- A fresh click costs 1 PS. Each click in the same state raises the next one by 1 PS, up to **8** (the *pressure ladder*). The ladder falls by 3 each turn. Another state is not affected.
- Money follows the PS cost: the price per PS point is a set amount per country, multiplied by the PS cost of the click and by a state-size factor.
- **Bigger states cost more** because one point of Org in a big state is worth more votes. The factor follows the square root of population and ranges from **0.5** in the smallest state to **2** in the largest, with the average state at 1.

If the treasury cannot cover the full price but covers at least **a quarter** of it, the click still adds one unit and takes whatever money is there. Below a quarter, the click is refused and costs nothing: no PS, no ladder rise. The build panel shows the price before you click.

### Who can click, and where

State chair, state vice chair, state campaigner, national chair, national vice chair and national campaigners can click Build Org. Treasurers cannot. The party must also have **presence** in the state: at least one member, elected official or active NPP homed there. No presence, no click, even for a national officer.

### Decay

A party that has not built in a state for **96 turns** starts losing units: **1% of its units per turn**, about 21% a day. Units halve in roughly 69 turns once decay starts. Any successful click resets the 96 turn clock for that state. The Unaffiliated stake never decays.

### Key numbers

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

### Why it matters at the polls

In a general election your Org share is weighted with diminishing returns: the vote weight is \`orgShare ^ 0.2\`. A 3 to 1 lead in Org becomes only about a 1.25 to 1 edge in weight. Org is one of several inputs, alongside candidate favorability and ideology. Primaries are unaffected, because everyone in a party's primary shares the same Org.

### Worked example

A state has 100 Unaffiliated units, your party holds 40 units and a rival holds 60: your share is 40 / 200 = **20%**. You build five times in one turn. Your PS cost climbs 1, 2, 3, 4, 5 for 15 PS in total. Your money cost in an average US state is ₳2,813, ₳5,625, ₳8,438, ₳11,250 and ₳14,063: about **₳42,200** in all. You now have 45 units out of 205, a share of **22.0%**. If you had spread the same five clicks over five turns, you would have paid 1 PS each and about ₳14,100 in total, because the ladder drops by 3 a turn. Spacing out clicks is the cheap way to build.

## What you can do

1. **Open the state party page** and make sure the party has a member, official or NPP in the state.
2. **Get funds.** The state treasury fills from member taxes, and the state party gains PS each turn (5 passive, more if the chair invests treasury money). Ask the state treasurer for a tax rate above 0, or ask the national party for a transfer. See [Party Actions](/wiki/party-actions).
3. **Click Build Org.** The panel shows the PS and money price before you commit.
4. **Space your clicks.** Costs rise with each click in the same state and recover quickly.
5. **Keep it alive.** One click every 96 turns avoids decay.

**How much Org do I need?** There is no fixed number. A party that reaches **20% Org in a third of a country's regions** graduates to Major (a quarter in the UK), and that is the usual goal. For votes, think in shares: doubling your Org share adds about 15% to your vote weight.

**Tips.**
- Build where the election is tight. A point of Org in a big state is worth more but costs more.
- Rivals cannot remove your units. They can only dilute your share by building their own.
- Keep the treasury above a quarter of the click price, or the click is refused.

## Connections

**Driven by**

- [Political Parties](/wiki/political-parties): each party holds its own Org share in each state.
- [Party Membership](/wiki/party-membership): a member in a state gives the party presence there.
- [Party Leadership](/wiki/party-leadership): only officers and campaigners can click Build Org.
- [Party Actions](/wiki/party-actions): Political Strength and treasury money pay for each click.

**Affects**

- [Party Actions](/wiki/party-actions): Org share earns regions toward Major tier and makes GOTV spending more efficient.
- [Party Leadership & Authority](/wiki/party-leadership-authority): Org decides how strong a UK regional party is outside its home nation.
- [General Elections](/wiki/general-elections): your Org share is part of your candidates' vote weight.

## Status

Live in every world and country with parties and states or regions. Build Org is not available in a region that does not support party organization. Prices are quoted in each country's own currency.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Party Building design page](https://docs.lakesidegames.net/design/party-building.html).
`;
