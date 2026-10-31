export const campaignManagerContent = `# Campaign Manager

Once you declare, a campaign page is where money and actions turn into votes. Every eligible candidacy gets its own: budget, upgrades, field offices, activity log, endorsements and manager assignments. It is separate from your character's profile and has its own action and money pools.

**Eligibility.** US president, Senate, governor, House and state senate races have a campaign page, as do UK Commons races and Japanese House of Representatives, House of Councillors and governor races. Presidential races in other countries with a directly elected president, such as Brazil, Nigeria and Russia, get one too. German and Irish races use the lighter election-detail page for now.

For upgrade tables, maintenance math and tactical priorities see [Campaign Strategy](/wiki/campaign-strategy), whose trees and costs are what you buy on this page.

## Budget and actions

The campaign has a **budget**: passive income and donations in (funds raised through [Fundraising and Ads](/wiki/fundraising-ads) can be donated in, see [Core Systems](/wiki/core-systems)), upgrade purchases, maintenance and field office upkeep out. Targeted Ads bought from the page are paid from the buyer's own Campaign Funds and actions, not the campaign budget. It also has an **action pool** of its own, earned each turn, that pays for upgrades and field offices rather than your character's actions. It also pays for Campaign Presence in [Political Operations](/wiki/political-operations). Three rules matter:

1. **Campaign actions** per turn = 4 + floor(sqrt(endorsements) x 3), so 0 endorsements give 4, 4 give 10, 9 give 13, 16 give 16 and 25 give 19. Governor and executive endorsements count 1.5 each (a governor's only outside presidential races), and player endorsements count only in presidential races. The base of 4 is the world's base actions per turn, halved for an NPP-run campaign. A campaign banks at most 48 turns of its own income (480 actions at 10 per turn). Actions already over the cap are kept.
2. **Upgrades** cost 1.5 times as much once the general election phase starts, so buy early.
3. **Maintenance** on some upgrades comes out of funds each turn. If funds plus this turn's income cannot cover it, upgrades downgrade automatically.

### The numbers

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
| Party members | The public summary, with upgrade levels fogged to plus or minus 1 |
| Public | Summary: candidate, party, managers, campaign strength and field offices, with upgrade levels fogged to plus or minus 3. No funds, actions, activity, endorsements or briefing |

Fog of war is automatic and refreshes every turn. An estimate never shows below 0 or above the lever's maximum. It is drawn from the old single-level upgrade fields, which Strategic Ops tree purchases do not change, so it does not reflect a rival's trees. Your own display is always exact.

## Walking the page

- **Vitals.** Across the top: war chest with net per turn and turns of runway, campaign actions against the bank cap, support, and campaign strength with its vote boost.
- **Overview.** Every section below on one page.
- **Money.** Fundraising income, upkeep for each lever and for field offices, total upkeep, the per-turn net, lifetime funds and actions generated and spent, and boxes to contribute from your own funds or a party treasury.
- **Strategic Ops.** Four branch trees: Fundraising, Media Spending, Ground Game and Opposition Research. Each card shows the starter node, its branches, the next cost in funds and campaign actions, and the current effect per turn. Ground Game moves votes in every race type, not only the presidency, and with Media and field offices it adds votes and turnout in [General Elections](/wiki/general-elections). See [Campaign Strategy](/wiki/campaign-strategy) for what each does.
- **Field offices.** Staff on the ground (below).
- **Ledger.** Activity and Endorsements tabs, ten rows per page. Activity lists upgrade purchases (with their cost in funds and actions), automatic downgrades and their reason, Opposition Research resets, and suspending the campaign to endorse someone else. It keeps the last 200 entries, normally the campaign's whole life. Endorsements lists the players and politicians backing the campaign, and the panel says "Politicians" where the rest of the wiki says NPPs. Both tabs are visible only to the campaign's own side.
- **Campaign Managers.** Appointment panel (below).
- **Campaign room briefing.** Below the main page (below).

## Field offices

- **United States:** pick a county on the state map and open an office. The map shades counties by partisan lean; switch to Opportunity to shade by what a new office would add.
- An office raises turnout in its county, weighted by the county's size and how strong your side is there, and adds a smaller boost across the whole state. The statewide part has diminishing returns, so the tenth office in a state adds much less than the first.
- **UK and Japan:** offices work by region rather than county, up to three per region, each adding a smaller boost.
- Offices take 3 turns to reach full strength, so early ground beats late ground.
- Each office costs funds and campaign actions to open, and funds each turn in upkeep. If the war chest cannot cover upkeep, the newest offices close first.
- A presidential campaign can run dozens of offices, a House campaign only a handful.
- Office locations are public.

These effects enter the vote model of every race with a campaign page, see [Election Mechanics](/wiki/election-mechanics). County leans start from the real county results of your world's era, then shift with your world's own presidential elections.

## Campaign managers

The candidate appoints up to **three** managers by searching for a character by name. A manager must live in your country and cannot be a candidate managing their own campaign. A manager can read the whole campaign page, buy upgrades, spend campaign actions and change Opposition Research targets. A manager cannot withdraw the candidate or change the manager list. Removing a manager takes their access away and does not change the campaign's funds or upgrades. This lets one player run the operations while the candidate plays the character.

## The campaign room briefing

A campaign gets a private briefing that turns the current race into a plan. It only reads numbers the engine already computed. The nominee and managers see it while the campaign is active. A running mate, party viewers and the public do not, because the coalition read is exactly what an opponent should not see. Its cards are filled in presidential races only; other races show no path data yet.

- **Path to victory.** In the primary, your delegates won, the majority you need, how many remain and the top five delegate leaders. In the general, the electoral votes you hold, the majority you need and the five closest states by margin.
- **Coalition weaknesses.** The five voter groups where your share of the field is lowest, weakest first.
- **Turnout plan.** Expected turnout, what campaign contact adds and what repeated contact gives back, with a Canvass or Targeted Ads suggestion for your three weakest groups.

Cash runway sits on the war chest vital, and lever levels and next-tier costs sit in the Operations section, not in the briefing.

The [Vote Factor Ledger](/wiki/vote-factor-ledger) tells you why you have the votes you have, and its factors feed the briefing's plan. The briefing tells you what to do about it. Weak segments from [granular polling](/wiki/granular-polling) guide where to spend effort.

## When the money runs out

If funds plus this turn's income cannot cover maintenance, the turn processor downgrades upgrades one step at a time, always the maintenance-bearing branch tier with the highest upkeep first, until maintenance is affordable.

**An example.** A presidential campaign holds ₳1,000 in funds with the base ₳20,000 income this turn and runs the Ground Game starter (₳11,000 upkeep) and the Media Spending starter (₳12,000 upkeep). Funds plus income is ₳21,000 against ₳23,000 of upkeep. Neither tree has upkeep branches, so a starter can go, and Media's has the higher upkeep and is dropped, leaving ₳11,000, which ₳21,000 covers. The ₳60,000 paid for Media is gone with no refund. This turn's passive effects still fire at their old levels, and the Activity tab logs the downgrade as insolvency. Existing negative funds are not healed: the campaign keeps the debt but stops bleeding.

## Donations

Anyone in the campaign's country can donate any whole amount of 1 or more from their own Campaign Funds. The campaign receives the same amount in its own currency. The party chair, vice chair and treasurer ([Political Parties](/wiki/political-parties)) can also disburse from the party treasury to any campaign of their party. Donations are kept in their own record with attribution, not in the Activity tab, and the page does not list them.

## Candidate-only operations

Only the candidate or an appointed manager can buy upgrades and change the Opposition Research target. In a presidential general election the running mate can also buy Fundraising upgrades. Only the candidate can withdraw.

## Your first turns on the page

- **Open the campaign** from the race page (View Campaign) once you have declared.
- **Plan the first turns:** Fundraising starter, then Media or Ground Game depending on the race. Media upgrades here raise the favorability behind primary scores in [Primaries](/wiki/primaries).
- **Appoint managers** if you want help with operations.
- **Open field offices** early.
- **Read the Money section** daily: if upkeep is above funds plus income, a downgrade is coming.

Common mistakes:

- Upgrading in the general instead of the primary, when everything costs 1.5 times as much.
- Buying high-maintenance branches you cannot afford, then losing them to a downgrade.
- Forgetting that Opposition Research retargets have a 6-turn cooldown.
- Over-reacting to a fogged opponent estimate.
- Ignoring endorsements. Nine endorsements give 13 actions a turn.

In the closing sprint, do not start new branches. Run the existing ones at full tilt, since media, research and canvassing effects double in the last 4 turns, and retarget Opposition Research at the current frontrunner.

Live for the offices listed under Eligibility. German and Irish races do not have a campaign page yet. Last checked 2026-10-30, version 1.18.0. Exact rules: [Campaign Manager (design)](https://docs.lakesidegames.net/design/campaign-manager.html). See also [NPPs Overview](/wiki/npps-overview) for requesting NPP endorsements.
`;
