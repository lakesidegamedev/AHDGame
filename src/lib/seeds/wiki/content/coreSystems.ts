export const coreSystemsContent = `# Core Systems

Time, actions and money bind every decision in A House Divided. A turn happens every real hour, each turn gives you actions to spend, and two separate pools of money pay for politics and for everything else. Understand these three and the rest of the game is detail.

## How it works

### Time: turns, days and years

One **turn** is one real hour in normal multiplayer. In game time it is one week, and the game uses a compressed 48-week year so election cycles fit real-world time.

| Unit | Real time | Game time |
| --- | --- | --- |
| 1 turn | 1 hour | 1 week |
| 24 turns | 1 day | 24 weeks |
| 48 turns | 2 days | 1 year |

The turn runs once an hour, on the hour, with no overnight break. Each turn refreshes actions, pays out funds, moves elections toward resolution, ages bills, lets non-player politicians (NPPs) act, settles markets and updates metrics. World resets are separate, announced events and are not part of the hourly clock.

Between main turns, markets can update at quarter-hour marks, and election returns and macro indicators can move at half past the hour. These small updates never give you actions, spend a campaign budget, run production or move a race deadline. A world that is inactive or mid-processing skips them.

### Term lengths

Terms are measured in turns, so real days equal turns divided by 24 at normal speed.

| Office | Cycle in turns | Real days | Game years |
| --- | ---: | ---: | ---: |
| US House | 96 | 4 | 2 |
| US Senate | 288 | 12 | 6 (three staggered classes) |
| US President | 192 | 8 | 4 |
| US Governor, State Senate | 192 | 8 | 4 |
| UK House of Commons | 240 | 10 | 5 |
| German Bundestag | 192 | 8 | 4 |
| Japanese House of Councillors | 288 | 12 | 6 |
| Irish Dáil | 192 | 8 | 4 |

Staggering keeps Senate activity continuous: one class of Senate seats is up for election every 4 real days. Other countries are on their hub pages: [United States](/wiki/us-overview), [United Kingdom](/wiki/uk-overview), [Germany](/wiki/de-overview), [Japan](/wiki/jp-overview) and [Ireland](/wiki/ie-overview).

**Why terms are short:** a real four-year cycle would mean a month between decisions. Compressing time keeps the game moving while keeping the order of events the same.

### Actions

Actions are your activity budget. Campaigning, ads, polls, wires to allies and many other moves cost them. Each turn you receive:

- **4 base actions**, for everyone.
- **An office bonus** on top. Typical values: House, State Senate, Bundestag, Sangiin, MP **+1**; Senate, Vice President, Governor **+2**; an executive President or a Prime Minister or Premier who runs the government **+4** (French Prime Minister **+3**); a ceremonial head of state **+0**. A cabinet minister gets **+1** on top of their seat. Each country hub has its own office table.
- **A role bonus** that stacks: Central Bank Chair **+3**, Supreme Court justice **+2**, and the highest chamber role you hold (presiding officers **+3**; majority and minority leaders and the Leader of the Opposition **+2**; president pro tempore, whips and shadow cabinet **+1**).
- **A party share**, a variable slice of your party's action pool based on your Party Influence and how close your positions are to the platform.
- **A one-time 25 actions** when you create the character.

**The cap and the hoarding penalty.** Your Energy stat sets two limits. The cap is 200 actions at Energy 1, rising to 250 at Energy 10. The hoard threshold is 100 at Energy 1, rising to 125 at Energy 10. Each turn you start above the threshold you lose 4 actions before the refresh. A character on only the base 4 gains 4 and loses 4, so a stockpile stops growing just above the threshold. This is why you may see your actions stop climbing or "lose 4 a turn". It exists so nobody banks months of actions and spends them in one burst to swamp an election.

\`\`\`wiki-chart
action-stockpile-hoarding
\`\`\`

**Office pools.** Ministerial, Vice President, justice and gubernatorial actions are separate pools, not part of your main balance. Ministerial actions return 1 every 6 turns up to 4. Vice President and Supreme Court actions return 1 every 12 turns up to 2. A governor holds up to 3. Once per turn per pool, you can pay **10 main actions to buy 1 office action**, up to that pool's cap.

### Money: two pools

- **Campaign Funds** are your political war chest. They pay for ads, polls, donor building, influence operations on NPPs, party taxes and personal campaign donations.
- **Cash on Hand** is personal money. It pays for wires from the Portfolio page, shares, bonds, property and sponsored news posts (5 actions plus ₳100,000).

The two are separate and do not convert automatically. A third pool, a corporation's treasury, belongs to the company, not to you.

**Campaign Funds arrive every turn.** The amount is a base rate for your home state's size, scaled by its GDP per person (0.9 to 1.5), plus a donor bonus and a flat office bonus. Your state and national party then take their tax, up to 33% each.

| Home state population | Base per turn | Donor bonus per level per turn |
| --- | ---: | ---: |
| Under 2 million | ₳5,000 | ₳100 |
| 2 to 8 million | ₳10,000 | ₳200 |
| 8 to 20 million | ₳20,000 | ₳400 |
| Over 20 million | ₳40,000 | ₳800 |

The donor bonus is multiplied by 1 plus your state Political Influence divided by 100. Flat office bonuses: House ₳5k, State Senate ₳3k, Senate ₳15k, Vice President ₳25k, Governor ₳15k, President ₳50k, and UK and German equivalents of ₳5k for MPs and members of the Bundestag and ₳50k for the Prime Minister and Chancellor.

Cash on Hand grows from dividends, bond coupons and share sales. A Personal Campaign Donation drains it: all the cash you donate leaves Cash on Hand, but only half of it reaches Campaign Funds and the other half is lost.

| Number | Value |
| --- | --- |
| Base actions per turn | 4 |
| Starting actions | 25 |
| Action cap | 200 (Energy 1) to 250 (Energy 10) |
| Hoard threshold, penalty | 100 (Energy 1) to 125 (Energy 10), 4 actions per turn |
| Office pool top-up | 10 main actions for 1 office action, once per turn per pool |
| Starting Campaign Funds | ₳250,000 |
| Starting Cash on Hand | ₳1,000,000, ₳2,500,000 or ₳5,000,000 by wealth background, lower in earlier eras |

### What happens each turn

\`\`\`flowchart-turn
\`\`\`

The list above is a simplified view of the election-facing steps. Actions and funds refresh first, then party elections, non-player politicians, bills, campaigns and election resolution, then policy effects, national numbers and history. Each step finishes before the next reads its results, which is why a Campaign you spend at 03:59 shows its effect on the next turn. The full order is on [Reference: Turn Order](/wiki/reference-turn-order).

### Worked example: one day for a base character

You are a character with no office in a large state (20,000 base per turn), donor level 3, Political Influence 20, home state at average GDP per person. Over 24 turns you get 96 actions (4 per turn) and about ₳21,440 per turn before party tax (20,000 base plus 400 x 3 x 1.2 donor bonus), or ₳514,560 over the day. If you start at 25 actions and never spend, you reach 101 after 19 turns and then stay flat: from there you lose 4 and gain 4 each turn. Spending at least a few actions a day keeps you under the threshold and growing.

## What you can do

- **Spend actions** from the Dashboard or the Actions page. The in-game quote shows the exact action and fund cost before you click. The full list of costs is on [Stats & Actions](/wiki/stats-actions).
- **Check your next election** on the Elections page. The race page shows when the primary and general end.
- **Top up an office pool** from that office's page by paying 10 main actions.
- **Plan around the hour**: log in once or twice a day, and hourly only for the closing turns of a close race (see [The Game Loop](/wiki/the-game-loop)).

Tips: spend before you hit the hoard threshold, keep Campaign Funds and Cash on Hand separate in your head, and note that perpetual elections mean no seat ever stays vacant: when a cycle resolves, the next one starts immediately and NPPs fill empty seats if you do not contest.

## Cabinets and campaign pages

**Cabinets.** Presidents and Prime Ministers appoint cabinets. In the US the President nominates any character to the principal posts (Secretary of State, Treasury, Defense, Attorney General and the others). Senators vote For, Against or Abstain over a 24-hour window, and a simple majority confirms. The White House Chief of Staff needs no Senate vote. A President can fire any confirmed member and can bridge one vacancy with a 24-turn acting appointment per office per term. See [Cabinet](/wiki/cabinet). Parliamentary countries follow their own conventions, on the country hubs.

**Campaign page.** Every candidacy has a Campaign page. The owner sees budget, operations and manager assignment, the party sees an intelligence snapshot, and the public sees a basic summary. It is where you spend a separate budget on Fundraising, Ground Game, Media Spending and Opposition Research, each a branch tree rather than a flat ladder. See [Campaign Manager](/wiki/campaign-manager) and [Campaign Strategy](/wiki/campaign-strategy).

## Connections

**Driven by**

- [Stats & Actions](/wiki/stats-actions): your Energy stat sets the action cap and hoard threshold, and your Fundraising stat scales fundraising.
- [Player Progression](/wiki/player-progression): the office you hold sets your action and fund bonuses.
- [Political Parties](/wiki/political-parties): your party share of actions and the party tax on your per-turn funds.
- [Relocation](/wiki/relocation): moving changes your home state, which sets your fund rate.

**Affects**

- [The Game Loop](/wiki/the-game-loop): the hourly turn sets how often you need to log in.
- [Election Mechanics](/wiki/election-mechanics): turns count the ballots and term lengths set the cycle.
- [Stats & Actions](/wiki/stats-actions): the action and fund flow is what the stats modify.
- [Cabinet](/wiki/cabinet): the cabinet bonus adds actions to ministers.
- [Campaign Manager](/wiki/campaign-manager): campaign budgets draw on your funds.
- [Crisis Interaction](/wiki/crisis-interaction): the turn clock decides cadence, expiry and when windows close
- [Player Random Events](/wiki/player-events): the turn clock sets event cooldowns and deadlines

## Status

These rules apply in every world and era. Office tables, term lengths and which offices exist differ by country, and some countries are open only in some eras. Speeds can differ in single-player worlds.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Every constant with its source and the full phase order are on the [Core Systems design page](https://docs.lakesidegames.net/design/core-systems.html).
`;
