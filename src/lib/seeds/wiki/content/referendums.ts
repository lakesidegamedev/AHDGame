export const referendumsContent = `# Independence and Reunification Referendums

Scotland and Wales can leave the United Kingdom, and Northern Ireland can leave to join Ireland. A referendum is how that happens: public desire builds up, the region's First Minister asks for a vote, the Prime Minister agrees or refuses, the region campaigns, and a Yes vote leads to a parliamentary consent step and then a real transfer of the region. It matters because a passing vote changes the map: the region's offices, parties, elections, companies and resources all move.

## How it works

1. **Desire builds.** Each region has a score from 0 to 100: Independence Desire in Scotland and Wales, Reunification Desire in Northern Ireland. It changes every turn (see the drift table below).
2. **The First Minister files a request** once desire reaches 60.
3. **The Prime Minister decides.** Granting opens a 48-turn campaign. Declining adds 5 to desire and locks the region for 96 turns.
4. **The campaign runs.** Yes and No support is tracked by demographic group (a cohort). Players spend actions and funds to persuade voters or raise turnout.
5. **The vote.** Yes must finish above 50%. A failed vote pulls desire toward 30 and locks the region for 480 turns.
6. **Consent.** A passing vote opens a 24-turn window for the parliamentary consent bills. When the required bills are enacted, the region transfers automatically.

Minimum time from a granted request to a transfer is therefore 48 turns of campaign plus the consent bills, up to a further 24 turns. At 48 turns per game year that is between 1 and 1.5 years after the Prime Minister says yes. Government formation and Royal Assent can add to it.

### Key numbers

| Item | Value |
| --- | --- |
| Desire needed to file a request | 60 |
| Cost to file | 3 office actions |
| Campaign length once granted | 48 turns |
| Desire change if the Prime Minister declines | +5 |
| Cooldown after a declined request | 96 turns |
| Yes share needed to pass | above 50% |
| Random swing added to the final vote | up to 4 points either way |
| Desire after a failed vote | pulled toward 30 |
| Cooldown after a failed vote | 480 turns |
| Consent window after a passing vote | 24 turns |
| Changing Westminster's stance | 2 national office actions, 72-turn cooldown per region |

### What moves desire

Desire changes every turn by the sum of these drivers. A turn is one hour of real time and there are 48 turns in a game year.

\`\`\`wiki-chart
independence-desire-drift
\`\`\`

| Driver | Effect per turn |
| --- | --- |
| First Minister's policy: pro-independence (or reunification) | +0.05 |
| First Minister's policy: anti-devolution | -0.04 |
| First Minister's policy: pro-devolution | 0 |
| Regional approval | 0.002 per point away from 50, up to 0.05, pushing in the direction of the First Minister's stance |
| Westminster's stance for that region | Half the First Minister's policy effect: +0.025 pro-independence, -0.020 anti-devolution, 0 pro-devolution |
| Westminster approval | 0.001 per point away from 50, up to 0.025, in the direction of Westminster's stance |
| UK inflation above 5% | +0.02 |
| UK inflation below 2% | -0.01 |
| UK inflation 2% to 5% | 0 |
| Pull back toward 25 | up to 0.003 |

Approval above 50% strengthens whichever stance the government holds, and approval below 50% weakens it. A pro-devolution stance stays neutral on separation whatever the approval. Referendum results and Northern Ireland peace-process decisions can also change desire directly.

Westminster picks a separate stance for Scotland, Wales and Northern Ireland from the UK Executive Devolution tab. Each new government may make its first change in each region even if the old government left a cooldown running, paying the usual 2 office actions. The Prime Minister and First Ministers can see both governments' stances and every driver, and the dashboards project one game year ahead and the time to reach 60. Those projections ignore events and do not waive cooldowns or consent.

**Worked example: a popular separatist government.** A pro-independence First Minister at 70% regional approval, with Westminster on pro-devolution and inflation at 3%, adds 0.05 (policy) plus 0.04 (20 approval points at 0.002) minus 0.003 (pull toward 25) = 0.087 a turn. Over 48 turns that is about 4.2 points a year. To go from 45 to 60 at that pace takes about 172 turns, or 3.6 game years.

**How to raise desire to 60 faster.** The most you can add in one turn is 0.05 (policy) + 0.05 (regional approval, at 75% or better) + 0.025 (Westminster pro-independence) + 0.025 (Westminster approval at 75% or better) + 0.02 (inflation above 5%) - 0.003 = 0.167. Fifteen points then takes about 90 turns, nearly two game years. In practice that needs both governments to push the same way.

### The campaign

The campaign starts from the desire value captured when the Prime Minister grants consent. That starting value is fixed: later desire drift does not change campaign support. The campaign tracks Yes and No support by cohort, and a cohort's turnout matters as well as its lean.

Campaign actions come in five types. Each either persuades (moves the lean) or mobilises (raises turnout). Returns diminish and each effect has a soft cap, so repeating the same action keeps helping but less and less.

| Action | Effect | Player cost (actions, campaign funds) | Party cost (political strength) |
| --- | --- | --- | --- |
| Press conference | Persuade, lean swing 0.5 | 1 action, 40,000 | 2 |
| Doorstep canvass | Mobilise, turnout push 5 | 1 action, 90,000 | 3 |
| Get-out-the-vote drive | Mobilise, turnout push 8 | 2 actions, 220,000 | 5 |
| Broadcast and digital ads | Persuade, lean swing 1.5 | 2 actions, 380,000 | 8 |
| Mass rally | Mobilise, turnout push 13 | 3 actions, 620,000 | 12 |

You can aim an action at the whole electorate, which spreads its effect over every cohort, or at one cohort, which concentrates it. A failed payment changes nothing.

The final vote adds a deterministic swing of up to 4 points in either direction, then Yes must be above 50%. Turnout is shown on the detail page and rises the further the result is from 50-50.

Party chairs and vice chairs can declare a public party position for Yes or No. A position is only a stance. It shows on the campaign page and the campaign wire, costs nothing and does not move the vote on its own. It can be changed or withdrawn only while the campaign runs.

### What a passing vote changes

Independence needs the Westminster consent bill before the new country is created. Northern Ireland reunification always needs a Westminster release bill. If Ireland is already open to players when the vote passes, it also needs a Dáil admission bill; otherwise Ireland opens to players on its own when the transfer completes.

When the transfer happens:

- Residents of the region, including your character if you live there, become residents of the new country and are placed in its capital area. Party members move with their party.
- UK offices held for the region end, including the region's MPs, and any cabinet posts held by people leaving.
- For Scotland and Wales, the First Minister stays on as head of the new government in a caretaker role.
- Regional ownership, parties, elections, companies, natural resources and the affected country maps all update. It is a world change, not a cosmetic result.

A transfer that stalls after the required consent is enacted is handled by the game team.

## What you can do

- **First Minister:** file the request from the regional office page once desire reaches 60. Filing costs 3 office actions. Until then, keep your policy stance and regional approval pointed the way you want desire to move.
- **Prime Minister:** grant or decline a request, and set Westminster's stance for each region (2 office actions, 72-turn cooldown). Granting a vote you expect to lose settles the question for 480 turns. Declining only delays it by 96 turns and raises desire by 5, which makes the next request likelier to succeed.
- **Any UK player:** spend actions and campaign funds on persuasion or turnout actions during the campaign.
- **Party officers:** spend the party's political strength on the same actions. **Chairs and vice chairs** can also declare a position.
- **Anyone, all along:** open the live hub at **Country > Referendums**, or go directly to [UK Referendums](/country/uk/referendums). The detail page shows the tracking poll and recent momentum, party positions, cohort support and turnout, the campaign wire and any consent bills.

Tips:

- Mobilise cohorts that already lean your way and persuade cohorts that are close to the line. Persuading a cohort that is far from you is slow.
- Watch the campaign wire: every push that moves the Yes share by 0.3 points or more is posted there, so you can see what the other side is spending on.
- The 4-point final swing means a poll within 4 points of 50% is still a gamble.

## Connections

**Driven by**

- [Government Approval](/wiki/government-approval): regional and Westminster approval push desire toward the government's stance.
- [National Metrics](/wiki/national-metrics): UK inflation above 5% adds to desire and inflation below 2% subtracts from it.
- [Demographics](/wiki/demographics): the region's demographic groups are the cohorts that the campaign moves.
- [Bills and Legislation](/wiki/bills-legislation): the consent bills must be enacted before the region transfers.

**Affects**

- [United Kingdom](/wiki/uk-overview): the region and its offices, parties and elections leave.
- [Ireland](/wiki/ie-overview): a Northern Ireland reunification brings the region in and may open Ireland to players.
- [Bills and Legislation](/wiki/bills-legislation): a passing vote creates the required consent bills.
- [Election Mechanics](/wiki/election-mechanics): the transfer stands up new elections in the new country.

## Status

Live in the United Kingdom only, in any world where Scotland, Wales and Northern Ireland have devolved governments. The referendum hub and campaign actions are open to UK players. Other countries have no referendum system.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The drift rules for devolved regions are on the [UK devolution policy design page](https://docs.lakesidegames.net/design/uk-devolution-policy.html).
`;
