export const campaignStrategyContent = `# Campaign Strategy

Most players lose races by misallocating across phases: over-campaigning early and running dry for the close, or fundraising endlessly and under-contesting. This page is about **what to do in what order** across the three phases of every race. For the vote math that decides elections see [Election Mechanics](/wiki/election-mechanics). The timing of when to spend and when to save for the closing turns is also laid out in [the game loop](/wiki/the-game-loop).

## Three phases: build, contest, close

1. **Build (before the primary):** accumulate political influence, favorability, donor base and party alignment. No election is open yet.
2. **Contest (primary and early general):** you are a declared candidate. Sustain your base stats while running the race.
3. **Close (final 4 turns of the general):** the campaign season multiplier turns on and the heaviest vote snapshots fall.

Poll results from [Polling](/wiki/polling) decide which phases and groups get your spend, and group sizes and appeal in [Demographics & Targeting](/wiki/demographics-targeting) decide where to aim ads and canvassing. Every action should move you closer to winning your next election. Early game builds the foundation, mid game positions you, and late game is turnout and closing pressure.

### Which action first

| Situation | Priority order |
| --- | --- |
| New character, no office | Campaign, Build Donor Network (to level 2), Fundraise, Commission Poll, Run Advertisements |
| Mid-build, no election yet | Fundraise, Campaign, Build Donor Network, Barnstorm for allies |
| Primary declared | Campaign heavily, targeted ads, stay close to your party's platform |
| General, opening | Campaign and ads in weak demographics, then a Full Demographic Poll |
| General, middle | Maintain influence and favorability, Opposition Research on the leading opponent |
| Final 4 turns | Closing-sprint campaigning, canvassing and ads |
| Incumbent between cycles | Maintain influence, fundraise for a war chest, build party influence |

## The campaign page: Strategic Ops trees

Once you are a candidate, your campaign page has a **separate budget** spent on **Strategic Ops trees** (the Operations section). It is not your personal Campaign Funds. Each of four trees has a starter node you unlock first, then up to three branches, each with three tiers. Branch effects stack with the starter and with other branches in the same tree, so two campaigns can have very different effects from the same tree.

The prices below are for a presidential race. Other races scale costs, income and upkeep down: 0.5x for governor, Senate and national legislature races, 0.4x for minister-president and Landtag races, 0.3x for House and regional council races, 0.2x for state senate races. The era price level and the campaign's currency apply on top.

| Tree | Starter (funds, actions) | Starter effect | Branches |
| --- | --- | --- | --- |
| Fundraising | ₳50,000, 10 | Raises base campaign income from ₳20,000 to ₳35,000 per turn | Grassroots (more income each turn), Bundlers (one-time cash), Direct Mail (multiplies all income) |
| Media Spending | ₳60,000, 12 | +0.5% favorability per turn, ₳12,000 maintenance | Broadcast and Television (more favorability), Rapid Response (blunts opposition research against you) |
| Ground Game | ₳55,000, 10 | +3% in swing areas, ₳11,000 maintenance | Swing Canvassing (bigger swing bonus), Get-Out-The-Vote (smaller bonus everywhere), Volunteer Corps (cuts upkeep) |
| Opposition Research | ₳40,000, 8 | -0.5% favorability per turn to one target | Dossier (more drain), Scandal Leak (one-time hit), Counter-Intel (amplifies the drain) |

The fundraising tree sets your campaign page's income (see [Fundraising and Ads](/wiki/fundraising-ads)), and the [Campaign Manager](/wiki/campaign-manager) is where you buy and monitor upgrades. Upgrades bought in the general phase cost 1.5x the funds and actions, so buy what you can in the primary.

**Maintenance** comes out of campaign funds every turn. Ground Game and Media upkeep is doubled against the base table, and their tier-3 branches cost 1.5x. If funds plus this turn's income cannot cover maintenance, the engine drops the single tier with the most upkeep one step, and repeats until the campaign is solvent. A tree's starter is shed only after all its upkeep branches are gone. There is no refund. Opposition Research has no upkeep. It can be retargeted, with a 6-turn cooldown.

![The four Strategic Ops trees, each with a starter node and three branches of three tiers.](/wiki-images/diagrams/campaign-strategy-ops-trees.svg)

## Campaign actions

Your campaign earns its own action pool each turn: the world's base actions per turn (at least 4, half that for an NPP-run campaign), plus endorsements. Politician endorsements count in every race, player endorsements only in presidential races, and governor and executive endorsements count 1.5 each (a governor's counts only outside presidential races). With a base of 4 the pool is 4 + floor(sqrt(endorsements) x 3), so 4 endorsements give 10 actions, 9 give 13 and 16 give 16. A campaign banks at most 48 turns of its own income. These actions pay for upgrades and for presidential Campaign Presence (see [Political Operations](/wiki/political-operations)), not for regular character actions.

## The closing multiplier

In the final 4 turns before an election closes, these effects automatically double: Media Spending favorability, Opposition Research drain and canvassing. Nothing to activate. Those 4 turns also carry 30% of the general-election vote, the heaviest turns of votes in [General Elections](/wiki/general-elections). Hold heavy spending for this window, because canvassing, media and research are worth about twice the same spend earlier. Ground Game bonuses and Run Advertisements do not double.

## Fog of war

Opponents do not see your exact upgrade levels, funds or research target on the campaign page. The public sees a per-lever level estimate that can be off by 3 levels either way, and your party sees within 1 level, never below 0 or above the lever's maximum. The fog refreshes every turn. The estimate is drawn from the old single-level upgrade fields, which Strategic Ops tree purchases do not change, so it does not reflect a rival's trees. Do not rely on opponent numbers.

## The numbers

| Item | Value |
| --- | --- |
| Campaign action pool | 4 + floor(sqrt(endorsements) x 3) per turn |
| Pool bank limit | 48 turns of income |
| General-phase upgrade cost | 1.5x |
| Branch tiers | 3 per branch, 3 branches per tree |
| Final-stretch multiplier | 2x on media, research and canvassing, last 4 turns |
| Fog of war | public plus or minus 3 levels, party plus or minus 1 |
| Ground Game and Media upkeep | 2x the base table |
| Research retarget cooldown | 6 turns |

## A campaign's first week

Take a presidential campaign with 9 endorsements, which earns 13 actions a turn. Turn 1: unlock the Fundraising starter (10 actions, ₳50,000). Income rises from ₳20,000 to ₳35,000 a turn, so the extra ₳15,000 pays it back in 4 turns. Turn 2: unlock Media Spending (12 actions, ₳60,000) for +0.5% favorability a turn at ₳12,000 maintenance. Over 40 turns that is up to +20 points of favorability for ₳480,000 of upkeep, less once you pass 60, where favorability starts to decay, and in the final 4 turns it doubles to +1.0 a turn. If funds plus income ever fall short of upkeep, tiers downgrade with no refund, so keep a buffer.

## Tactics by phase

**Build phase:** build donor base early (see [Fundraising and Ads](/wiki/fundraising-ads)), push favorability toward 65 with ads (+3 each before Charisma), push influence to 40 or more with daily Campaign actions, and join a party and build party influence.

**Primary phase:** campaign hard in-state. Influence feeds the primary score on a square-root curve (25 x sqrt(influence / 100)), so one more influence point is worth about 0.25 points near influence 25, about 0.18 near 50 and about 0.125 near 100. Keep favorability at 70 or more, since each point is worth 0.35 score points. Presidential primaries score differently: favorability is worth 0.25 a point and national reach replaces in-state influence. Stay close to your party's platform. Do not attack primary rivals.

**Early general:** buy upgrades before the 1.5x cost applies if you can, run a Full Poll, and aim ads and canvassing at weak groups.

**Final sprint:** (the phase playbook in [Primary vs General Tactics](/wiki/primary-general-tactics) builds on this allocation.) burst Campaign actions for influence, ads for favorability, canvass aligned groups, and let Opposition Research drain at double rate. Log in hourly. Every turn matters.

## Budget red flags

On the campaign page Money section watch for maintenance above funds plus income (a downgrade fires next turn), negative net per turn (funds are draining toward that point), and income declining (campaign income comes only from the Fundraising tree, so it falls only when a Direct Mail tier or the starter is downgraded). Field office upkeep is listed there too.

## Do and don't

- **Pick the next upgrade** by phase. Fundraising first for a poor campaign, Media and Ground Game when you can afford the upkeep, Opposition Research against a close leader.
- **Spend the campaign pool** on upgrades and presidential state presence.
- **Hold your burst** for the final 4 turns.
- **Read the Money section** each day. If you are new, the plan the [first campaign walkthrough](/wiki/first-campaign-walkthrough) follows starts here.

Do not:

- Over-buy ads above favorability 70, where each point over 70 reduces an ad's gain by 0.1.
- Canvass misaligned groups: on current races a badly misaligned audience gets only 4% of base.
- Keep Ground Game or Media tiers you cannot maintain.
- Attack everything that moves. Attacks add infamy and fail more often as infamy rises.

Live in every world and country with candidate campaigns. Which offices have a campaign page is listed under [Campaign Manager](/wiki/campaign-manager). Last checked 2026-10-30, version 1.18.0. Exact rules: [Campaign Strategy (design)](https://docs.lakesidegames.net/design/campaign-strategy.html). See also [Party Organization](/wiki/party-organization).
`;
