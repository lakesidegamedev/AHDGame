export const referendumsContent = `# Independence and Reunification Referendums

Scotland and Wales can leave the United Kingdom, and Northern Ireland can leave to join Ireland. A passing vote changes the map: the region's offices, parties, elections, companies and resources all move. Getting there takes a region whose people want out, a First Minister who asks, a Prime Minister who agrees, a campaign that wins, and Parliament's consent.

## From rising desire to a vote

Each region has a score from 0 to 100: Independence Desire in Scotland and Wales, Reunification Desire in Northern Ireland. It changes every turn (see "What moves desire" below). Once it reaches 60, the region's First Minister can file a request, which costs 3 office actions.

The Prime Minister then decides. Granting opens a 48-turn campaign. Declining adds 5 to desire and locks the region for 96 turns, so the next request is likelier to succeed. In the campaign, Yes and No support is tracked by demographic group (a cohort) and players spend actions and funds to persuade voters or raise turnout. At the end, Yes must finish above 50%. A failed vote resets desire to 30 and locks the region for 480 turns. A passing vote opens a 24-turn vote on the parliamentary consent bills, and when the required bills are enacted the region transfers automatically. If a consent bill fails, the transfer is cancelled, with no cooldown on a new request.

Minimum time from a granted request to a transfer is therefore 48 turns of campaign plus the consent bills, up to a further 24 turns. At 48 turns per game year that is between 1 and 1.5 years after the Prime Minister says yes. Government formation and Royal Assent can add to it.

![Flow of a referendum from rising desire and a request through the Prime Minister's decision, campaign and vote to a consent window and transfer, with decline and fail branches.](/wiki-images/diagrams/referendums-request-flow.svg)

| Item | Value |
| --- | --- |
| Desire needed to file a request | 60 |
| Cost to file | 3 office actions |
| Campaign length once granted | 48 turns |
| Desire change if the Prime Minister declines | +5 |
| Cooldown after a declined request | 96 turns |
| Yes share needed to pass | above 50% |
| Random swing added to the final vote | up to 4 points either way |
| Desire after a failed vote | reset to 30 |
| Cooldown after a failed vote | 480 turns |
| Consent window after a passing vote | 24 turns |
| Changing Westminster's stance | 2 national office actions, 72-turn cooldown per region |

## What moves desire

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

Two of these come from other systems. [Government Approval](/wiki/government-approval) matters because approval above 50% strengthens whichever stance the government holds, and approval below 50% weakens it. A pro-devolution stance stays neutral on separation whatever the approval. [National Metrics](/wiki/national-metrics) matters because UK inflation above 5% adds to desire and inflation below 2% subtracts from it. Referendum results and Northern Ireland peace-process decisions can also change desire directly.

Westminster picks a separate stance for Scotland, Wales and Northern Ireland from the UK Executive Devolution tab. Each new government may make its first change in each region even if the old government left a cooldown running, paying the usual 2 office actions. The Prime Minister and First Ministers can see both governments' stances and every driver, and the dashboards project one game year ahead and the time to reach 60. Those projections ignore events and do not waive cooldowns or consent.

**A popular separatist government.** A pro-independence First Minister at 70% regional approval, with Westminster on pro-devolution and inflation at 3%, adds 0.05 (policy) plus 0.04 (20 approval points at 0.002) minus 0.003 (pull toward 25) = 0.087 a turn. Over 48 turns that is about 4.2 points a year. To go from 45 to 60 at that pace takes about 172 turns, or 3.6 game years.

**The fastest possible climb.** The most you can add in one turn is 0.05 (policy) + 0.05 (regional approval, at 75% or better) + 0.025 (Westminster pro-independence) + 0.025 (Westminster approval at 75% or better) + 0.02 (inflation above 5%) - 0.003 = 0.167. Fifteen points then takes about 90 turns, nearly two game years. In practice that needs both governments to push the same way.

## Running the campaign

The campaign starts from the desire value captured when the Prime Minister grants consent. That starting value is fixed: later desire drift does not change campaign support. The campaign tracks Yes and No support by cohort, and the cohorts are the region's groups from [Demographics](/wiki/demographics). A cohort's turnout matters as well as its lean.

Campaign actions come in five types. Each either persuades (moves the lean) or mobilises (raises turnout). Returns diminish and each effect has a soft cap, so repeating the same action keeps helping but less and less.

| Action | Effect | Player cost (actions, campaign funds) | Party cost (political strength) |
| --- | --- | --- | --- |
| Press conference | Persuade, lean swing 0.5 | 1 action, 40,000 | 2 |
| Doorstep canvass | Mobilise, turnout push 5 | 1 action, 90,000 | 3 |
| Get-out-the-vote drive | Mobilise, turnout push 8 | 2 actions, 220,000 | 5 |
| Broadcast and digital ads | Persuade, lean swing 1.5 | 2 actions, 380,000 | 8 |
| Mass rally | Mobilise, turnout push 13 | 3 actions, 620,000 | 12 |

You can aim an action at the whole electorate, which spreads its effect over every cohort, or at one cohort, which concentrates it. A failed payment changes nothing. Mobilise cohorts that already lean your way and persuade cohorts that are close to the line; persuading a cohort far from you is slow.

Any UK player can spend actions and campaign funds this way, and party officers can spend the party's political strength on the same actions. Party chairs and vice chairs can also declare a public party position for Yes or No. A position is only a stance. It shows on the campaign page and the campaign wire, costs nothing and does not move the vote on its own. It can be changed or withdrawn only while the campaign runs.

Open the live hub at **Country > Referendums** (the menu link appears while a campaign is live), or go directly to [UK Referendums](/country/uk/referendums). The detail page shows the tracking poll and recent momentum, party positions, cohort support and turnout, the campaign wire and any consent bills. Every push that moves the Yes share by 0.3 points or more is posted on the wire, so you can see what the other side is spending on.

The final vote adds a deterministic swing of up to 4 points in either direction, then Yes must be above 50%. A poll within 4 points of 50% is still a gamble. Turnout is shown on the detail page and comes from the cohorts: each cohort's base turnout plus whatever mobilising has added to it.

## The Prime Minister's choice

The Prime Minister grants or declines a request, and sets Westminster's stance for each region (2 office actions, 72-turn cooldown). When the Prime Minister is an NPP, the governing party's chair or vice chair can decide instead; if nobody has decided 24 turns after the request, the NPP government declines when Westminster's stance for that region is anti-devolution and grants otherwise. Granting a vote you expect to lose settles the question for 480 turns. Declining only delays it by 96 turns and raises desire by 5, which makes the next request likelier to succeed. The First Minister's side of it is simpler: file once desire reaches 60, and until then keep your policy stance and regional approval pointed the way you want desire to move.

## What a passing vote changes

Independence needs the Westminster consent bill before the new country is created, and the consent bills have to be enacted through [Bills and Legislation](/wiki/bills-legislation). Northern Ireland reunification always needs a Westminster release bill. If Ireland is already open to players when the vote passes, it also needs a Dáil admission bill; otherwise Ireland opens to players on its own when the transfer completes.

When the transfer happens:

- In Scotland and Wales, residents of the region, including your character if you live there, become residents of the new country and are placed in its capital area. The region's own party (the SNP or Plaid Cymru) moves with its members; members of UK-wide parties become Independents, and those parties have to be re-formed in the new country.
- In Northern Ireland, player residents stay in the region, which becomes part of Ireland, and become Independents. The region's party organisations are dissolved, and its NPP politicians move to London and stay in the UK.
- UK offices held for the region end, and so do cabinet posts held by people leaving. Scottish and Welsh MPs lose their seats; Northern Ireland's MPs carry over into the Dáil. If the Prime Minister is among those leaving, the UK government falls and has to be formed again. The [United Kingdom](/wiki/uk-overview) loses the region and its offices, parties and elections.
- For Scotland and Wales, the First Minister stays on as head of the new government in a caretaker role.
- Regional ownership, parties, elections, companies, natural resources and the affected country maps all update. It is a world change, not a cosmetic result. New elections are stood up in the new country under [Election Mechanics](/wiki/election-mechanics), and a Northern Ireland reunification brings the region into [Ireland](/wiki/ie-overview).

A transfer that stalls after the required consent is enacted is handled by the game team.

Live in the United Kingdom only, in any world where Scotland, Wales and Northern Ireland have devolved governments. Other countries have no referendum system. Last checked 2026-10-29, version 1.18.0. Exact rules: [UK devolution policy (design)](https://docs.lakesidegames.net/design/uk-devolution-policy.html)
`;
