export const playerProgressionContent = `# Player Progression

Nothing is handed to you in this game: every seat is won at the ballot box, and every seat you win pays you back in actions, funds and National Influence (NPI), the number presidential races reward. This page is the climb as a click path: spawn, build, join a party, win a first primary, win a general, then go up. It says what to click at each stage and what each rung pays.

## What each rung pays

Your character always has one **current office** (or none). You earn the next office by winning an election for it, and that depends on the [elections](/wiki/election-mechanics) themselves. Each rung pays a flat bonus to actions and funds every turn, so climbing makes the next climb cheaper. Offices are not a hard ladder: nothing stops you from filing for a higher office early, but low offices cost less to win and teach you the system.

**Why a ladder at all:** a higher office needs more Political Influence, Favorability and funds to win. The cheapest way to have those is to hold a lower office that pays for them.

| Office | Extra actions per turn | Extra funds per turn | NPI position bonus |
| --- | --- | --- | --- |
| House, State Senate, MP, MdB, Sangiin | +1 | House ₳5k, State Senate ₳3k, MP or MdB ₳5k | State legislator +0.5, national legislator +1.0 |
| Senate, Vice President | +2 | Senate ₳15k, Vice President ₳25k | Senate +1.0, Vice President +2.0 |
| Governor | +2 | ₳15k | +1.5 |
| President, Prime Minister, Chancellor | +4 | ₳50k | +2.5 |
| Central Bank Chair | +3, stacks | see the country hub | +1.5 |
| Supreme Court justice | +2, stacks | none | +1.5 |
| Chamber leadership (Speaker +3, leaders +2, whips +1) | stacks on your seat | none | up to +2.0 |

Non-US offices grant the local equivalent, and ceremonial heads of state get +0 actions. Country hubs have the exact table. Base actions are 4 per turn on top of everything here. The office you hold sets your action and fund bonuses each turn ([Core Systems](/wiki/core-systems)), and offices add to the NPI position bonus in [Stats & Actions](/wiki/stats-actions), whose PI, Favorability and donor level also decide whether you can win. NPI from offices feeds presidential races ([Elections Player Guide](/wiki/elections-player-guide)).

## The climb, stage by stage

### Just spawned

Your dashboard shows Independent, no office, 25 actions, ₳250,000 Campaign Funds, personal Cash on Hand from your wealth background (₳1,000,000, ₳2,500,000 or ₳5,000,000), Favorability 50 and Political Influence 10. Your country and starting kit from [Create a Character](/wiki/create-a-character) decide the ladder and the first rung, and the first-week plan in [Getting Started](/wiki/getting-started) puts you on it.

### Building before you file

An Independent enters the independent primary instead of a named party's primary. You can already Campaign, Fundraise, buy ads, run polls, Support, Attack, Barnstorm, influence NPPs and publish news. A good target before you file: PI 40 to 60, Favorability 60 to 70 and donor level 3. This is advice, not a rule. The [First Campaign Walkthrough](/wiki/first-campaign-walkthrough) is a worked example of winning that first rung.

### Joining a party

Open **Parties**, open a party close to your sliders, and join. [Political Parties](/wiki/political-parties) decide primary access and leadership races. You get primary access, Party Influence, a share of the party action pool and later leadership races. Leaving resets Party Influence to 0 and drops party-only roles. After you join or switch, there is a 24-hour wait before you can join another party.

### Your first primary

1. Open **Elections** and filter to your home state or region and a low office (State Senate, House, MP, MdB). State and regional races can only be entered from your home state, which is why [relocating](/wiki/relocation) comes first if you want a different one.
2. Open the race and confirm the primary window is open.
3. Run a Quick Poll, then declare.
4. Open **View Campaign**, spend Campaign for PI and request NPP endorsements. Do not attack rivals in your own party.

You can only hold one active candidacy at a time. Your standing sets how your party's voters split their ballots over the closing window, and the top count per party goes to the general.

\`\`\`guide-screenshot
elections
\`\`\`

### Your first general

The race page now shows a live tally. The final 4 turns carry 30% of the vote pool (see [The Game Loop](/wiki/the-game-loop)).

1. Campaign every day to keep PI up.
2. Run ads to hold Favorability at 65 to 70. Above 70 each ad gives less.
3. Endorsements matter more than in the primary.
4. Log in hourly for the last four turns.

\`\`\`guide-screenshot
campaign
\`\`\`

### Winning, and losing

Your profile shows the office and new menus open: legislature, bills, maybe cabinet. A legislator can vote and propose bills. Proposing costs 10 actions plus National Influence for each influence-counting provision: 5 for the first, 10 for the second and 15 for the third (30 for all three). An executive handles nominations and signing or vetoing, and appoints a [cabinet](/wiki/cabinet).

**If you lose a general:** your PI, Favorability and donor level stay. Your funds are probably spent, and Fundraise rebuilds them. You start the next cycle well ahead of week 1.

**If you leave an office** (lose a re-election, resign, or relocate), the action and fund bonus stops with it. NPI then drifts toward whatever your new position supports, losing half the gap in about 69 turns.

\`\`\`guide-screenshot
legislature
\`\`\`

### Going up

A typical US climb is State Senate, House, Senate, Governor, President. In parliamentary countries you win a seat, then party leadership, then PM or Chancellor after the chamber result and a confidence vote. Executive offices can have term limits: see [Executive Term Limits](/wiki/executive-term-limits).

![The typical US office ladder with the action and fund bonus at each rung, and the parliamentary route to Prime Minister or Chancellor.](/wiki-images/diagrams/player-progression-office-ladder.svg)

**How to become President.** There is no minimum NPI, but presidential races reward it directly, so build it before you file. NPI settles at 100 times your per-turn gain. As a House member with PI 40, your gain is 0.3 from PI plus 1.0 for the seat, so NPI heads toward 130. Starting from 0 it reaches 100 in about 146 turns, roughly 6 real days. At 100, your general-election reach from NPI is maxed. Keeping it takes ongoing position: NPI decays 1% per turn.

\`\`\`wiki-chart
national-influence-climb
\`\`\`

### A two-cycle career

You start as an Independent with PI 10 and join a party on day 1. Over week 1 you push PI to about 30 and run a poll. You win a State Senate primary and general, which pays +1 action and ₳3,000 per turn and a state-legislator NPI bonus of +0.5. At PI 30 your PI term is +0.1, so NPI heads toward 60.

In cycle 2 you run for the House with PI near 40: your seat now pays +1 action and ₳5,000 per turn and NPI heads toward 130. After a loss in cycle 2 you would keep PI, Favorability and donor level, lose the State Senate bonus once you leave that seat, and be positioned to run again.

### Without an office

You can run the whole campaign loop and a corporation. You cannot write or vote on bills. Corporations are under **Corporations** in the nav.

\`\`\`guide-screenshot
corporation
\`\`\`

## Your first week

- [ ] Party joined.
- [ ] PI climbing with Campaign; Favorability 60+.
- [ ] First low-office primary identified and polled.
- [ ] You are not filing Senate/President as your opener.
- [ ] You know which screen is Dashboard vs Elections vs Campaign vs legislature.

\`\`\`guide-screenshot
legislature
\`\`\`

The ladder exists in every country, with local office names and bonus tables; some offices exist only in some eras or countries, and a few countries are open to players only in some worlds. Last checked 2026-10-29, version 1.18.0. Exact rules: [Player Progression (design)](https://docs.lakesidegames.net/design/player-progression.html)
`;
