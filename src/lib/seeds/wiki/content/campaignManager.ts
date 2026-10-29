export const campaignManagerContent = `# Campaign Manager

Every eligible candidacy gets its own **campaign page**. It is where a candidate's campaign lives: budget, upgrades, field offices, activity log, endorsements and manager assignments. It is separate from your character's profile and has its own action and money pools. If you are running for office, this is the page where you turn money and actions into votes.

**Eligibility.** US president, Senate, governor, House and state senate races have a campaign page, as do UK Commons races and Japanese House of Representatives, House of Councillors and governor races. German and Irish races use the lighter election-detail page for now.

For upgrade tables, maintenance math and tactical priorities see [Campaign Strategy](/wiki/campaign-strategy).

## How it works

The campaign has a **budget**: passive income and donations in, upgrade purchases, maintenance, field office upkeep and ad spend out. It also has an **action pool** of its own, earned each turn, that pays for upgrades and field offices rather than your character's actions. Three rules matter:

1. **Campaign actions** per turn = 4 + floor(sqrt(endorsements) x 3), so 0 endorsements give 4, 4 give 10, 9 give 13, 16 give 16 and 25 give 19. Governor and executive endorsements count at their own weight, and player endorsements count only in presidential races. A campaign banks at most 48 turns of its own income (480 actions at 10 per turn). Actions already over the cap are kept.
2. **Upgrades** cost 1.5 times as much once the general election phase starts, so buy early.
3. **Maintenance** on some upgrades comes out of funds each turn. If next turn's funds cannot cover it, upgrades downgrade automatically.

### Key numbers

| Item | Value |
| --- | --- |
| Campaign managers | Up to 3 |
| Baseline campaign actions | 4 per turn |
| Action bank limit | 48 turns of income |
| General-phase upgrade cost | 1.5x funds and actions |
| Opposition Research retarget cooldown | 6 turns |
| Field office ramp | 3 turns to full strength |
| UK and Japan field offices | Up to 3 per region |
| Fog of war on upgrade levels | public plus or minus 3, party plus or minus 1 |
| Briefing viewers | Nominee and managers only |

### Who sees what

| Viewer | What they see |
| --- | --- |
| Campaign owner (candidate) | Everything: budget, upgrades, activity log, managers, endorsements |
| Campaign manager (appointed) | The same pages as the candidate, and can run upgrades and actions |
| Party members | Intelligence view: strategy, polling, spending, with upgrade levels fogged to plus or minus 1 |
| Public | Basic summary: candidate, office, party, status, with upgrade levels fogged to plus or minus 3 |

Fog of war is automatic and refreshes every turn, so an opponent at level 5 shows to you as 2 to 8, and to their own party as 4 to 6. Your own display is always exact.

### The sections

- **Overview.** Candidate, party, office, fundraising level and passive income, active upgrades, endorsement count, funds and net income per turn, and a live estimated vote share.
- **Budget.** Income against spending over time, the per-turn net, a category breakdown (maintenance, party tax, ads), and warnings for negative funds or a coming downgrade.
- **Strategic Ops.** Four branch trees: Fundraising, Media Spending, Ground Game and Opposition Research. Each card shows the starter node, its branches, the next cost in funds and campaign actions, and the current effect per turn. Ground Game moves votes in every race type, not only the presidency. See [Campaign Strategy](/wiki/campaign-strategy) for what each does.
- **Field offices.** Staff on the ground (below).
- **Activity and Endorsements.** Two tabs, ten rows per page. Activity lists upgrade purchases (with their cost in funds and actions), automatic downgrades and their reason, and suspending the campaign to endorse someone else. It goes back to the campaign's first purchase. Endorsements lists the players and politicians backing the campaign, and the panel says "Politicians" where the rest of the wiki says NPPs. Both tabs are visible only to the campaign's own side.
- **Campaign Managers.** Appointment panel (below).
- **Campaign room briefing.** Presidential campaigns only (below).

### Field offices

- **United States:** pick a county on the state map and open an office. The map shades counties by partisan lean; switch to Opportunity to shade by what a new office would add.
- An office raises turnout in its county, weighted by the county's size and how strong your side is there, and adds a smaller boost across the whole state. The statewide part has diminishing returns, so the tenth office in a state adds much less than the first.
- **UK and Japan:** offices work by region rather than county, up to three per region, each adding a smaller boost.
- Offices take 3 turns to reach full strength, so early ground beats late ground.
- Each office costs funds and campaign actions to open, and funds each turn in upkeep. If the war chest cannot cover upkeep, the newest offices close first.
- A presidential campaign can run dozens of offices, a House campaign only a handful.
- Office locations are public.

County leans start from the real county results of your world's era, then shift with your world's own elections.

### Campaign managers

The candidate appoints up to **three** managers by searching for a character by name. A manager must live in your country and cannot be a candidate managing their own campaign. A manager can read the whole campaign page, buy upgrades, spend campaign actions and change Opposition Research targets. A manager cannot withdraw the candidate or change the manager list. Removing a manager takes their access away and does not change the campaign's funds or upgrades. This lets one player run the operations while the candidate plays the character.

### Campaign room briefing

A presidential campaign gets a private briefing that turns the current race into a plan. It only reads numbers the engine already computed. The nominee and managers see it. A running mate, party viewers and the public do not, because the coalition read is exactly what an opponent should not see.

- **Path to victory.** In the primary, your delegates won, the majority you need, how many remain and the top delegate leaders. In the general, the electoral votes you hold, the majority you need and the five closest states by margin.
- **Cash runway.** How many turns your funds last at the current burn, or unbounded if you are net positive.
- **Coalition weaknesses.** Your weakest voter groups, weakest first.
- **Ops saturation and tradeoffs.** How far each lever is invested and what the next tier costs and does.

The [Vote Factor Ledger](/wiki/vote-factor-ledger) tells you why you have the votes you have. The briefing tells you what to do about it.

### Insolvency and automatic downgrade

If funds plus this turn's income cannot cover maintenance, the turn processor downgrades upgrades one step at a time, always the maintenance-bearing branch tier with the highest upkeep first, until maintenance is affordable.

**Worked example.** A campaign holds ₳4,000 in funds with ₳3,000 income this turn and runs the Ground Game starter (₳5,500 upkeep) and the Media Spending starter (₳6,000 upkeep). Funds plus income is ₳7,000 against ₳11,500 of upkeep. Media's starter has the highest upkeep and is dropped, leaving ₳5,500, which ₳7,000 covers. The ₳60,000 paid for Media is gone with no refund. This turn's passive effects still fire at their old levels, and the Activity tab logs the downgrade as insolvency. Existing negative funds are not healed: the campaign keeps the debt but stops bleeding.

### Donations

Anyone can donate any whole amount of 1 or more from their own Campaign Funds. The campaign receives the same amount, with currency conversion only when the currencies differ. National and regional party chairs and the treasurer can also disburse from the party treasury to any candidate in their party. Donations show in the Budget tab with attribution. They are kept in their own record, not in the Activity tab.

### Candidate-only operations

Only the candidate or an appointed manager can buy upgrades and change the Opposition Research target. Only the candidate can withdraw.

## What you can do

- **Open the campaign** from the race page (View Campaign) once you have declared.
- **Plan the first turns:** Fundraising starter, then Media or Ground Game depending on the race.
- **Appoint managers** if you want help with operations.
- **Open field offices** early.
- **Read the Budget tab** daily for downgrade warnings.

Common mistakes:

- Upgrading in the general instead of the primary, when everything costs 1.5 times as much.
- Buying high-maintenance branches you cannot afford, then losing them to a downgrade.
- Forgetting that Opposition Research retargets have a 6-turn cooldown.
- Over-reacting to a fogged opponent estimate.
- Ignoring endorsements. Nine endorsements give 13 actions a turn.

In the closing sprint, do not start new branches. Run the existing ones at full tilt, since media, research and canvassing effects double in the last 4 turns, and retarget Opposition Research at the current frontrunner.

## Connections

**Driven by**

- [Fundraising and Ads](/wiki/fundraising-ads): campaign funds from fundraising and donations pay for upgrades and upkeep.
- [Campaign Strategy](/wiki/campaign-strategy): its trees and costs are what you buy on this page.
- [Vote Factor Ledger](/wiki/vote-factor-ledger): the ledger's factors feed the briefing's plan.
- [Political Parties](/wiki/political-parties): party chairs can donate from the treasury.
- [granular-polling](/wiki/granular-polling): weak segments guide where to spend campaign effort
- [Core Systems](/wiki/core-systems): campaign budgets draw on your funds

**Affects**

- [Primaries](/wiki/primaries): upgrades and actions here raise the influence and favorability behind primary scores.
- [General Elections](/wiki/general-elections): Ground Game, Media and field offices add votes and turnout in the general.
- [Political Operations](/wiki/political-operations): the campaign's action pool pays for Campaign Presence.
- [Election Mechanics](/wiki/election-mechanics): the campaign's effects enter the presidential vote model.

## Status

Live for the offices listed under Eligibility. German and Irish races do not have a campaign page yet.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Campaign Manager design page](https://docs.lakesidegames.net/design/campaign-manager.html). Also see [NPPs Overview](/wiki/npps-overview) for requesting NPP endorsements.
`;
