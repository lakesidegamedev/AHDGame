export const theGameLoopContent = `# The Game Loop

You do not need to live in the tab. The game runs an hourly turn whether you are there or not, so this page is about when a click is worth your time and what happens if you skip one. Most days a ten-minute visit is enough. A few moments, mainly the closing turns of a general election, reward being online every hour.

## How it works

Every hour the game runs one **turn**. It refreshes actions, pays Campaign Funds, decays or grows your meters, counts election ballots and moves bills, NPPs and markets forward. You can act any time between turns, and what you spend is processed on the next turn.

\`\`\`wiki-chart
general-election-vote-pool
\`\`\`

| Number | Value |
| --- | --- |
| Turn length | 1 real hour, on the hour |
| Actions per turn | 4 base, plus office, role and party bonuses |
| Action cap, hoard threshold | 200 to 250 and 100 to 125, set by your Energy stat |
| Hoarding penalty | 4 actions per turn above the threshold |
| Political Influence decay | 0.75% per turn |
| National Influence decay | 1% per turn |
| General-election vote pool, last 4 turns | 30% of all votes, 7.5% per turn |
| General-election vote pool, the 8 turns before that | 20%, 2.5% per turn |
| General-election vote pool, everything earlier | 50%, shared evenly |

**What a turn does while you are offline:**

- Actions refresh (4 base plus bonuses).
- Campaign Funds arrive from your home state, donor base and office.
- PI decays 0.75% (faster for the governing party when its approval is low). NPI decays 1%, then gains from your PI and office. Infamy decays 5%. Favorability drains if above 60.
- Elections, bills, NPPs and markets advance.

Refresh the Dashboard after the hour to see the new numbers. Market prices can update at quarter-hour marks, and election returns and macro indicators can move at half past the hour. Those extra updates never give another action refresh. Click the turn timer to check turn health if processing looks late. The timer counts down to the next turn, so you never need to work out time zones.

**Why the last four turns matter so much.** A general election accumulates ballots turn by turn, and the closing turns are weighted. In a 24-turn general window (the US House, for example), the first 12 turns share 50%, which is about 4.17% per turn. The 8 ramp turns carry 2.5% each. The final 4 turns carry 7.5% each. One closing turn is worth about 1.8 early turns, so a lead you hold into the end beats a lead you build and let slip.

### What skipping costs

- **A day away:** nothing is lost. Unspent actions carry over, and a day adds 96 base actions. You lose standing in only two ways: PI and NPI decay a little each turn, and opponents may move.
- **A long absence:** once you sit above your hoard threshold, you lose 4 actions per turn, so a base-4 character at Energy 1 stops growing at about 101. A character with an office keeps growing slowly.
- **Missed windows:** a primary declaration window that closes is gone until the next cycle. That is the costly miss.

## What you can do

**The 10-minute daily pass:**

1. Open **Dashboard** and read notifications (endorsements, attacks, race phase changes).
2. If you are in a race, open **View Campaign** and spend Campaign until PI holds or rises.
3. If Favorability is under 60, run one advertisement.
4. Fundraise once if you have a donor base (level 1 or more).
5. If you hold office, open the legislature and clear your vote queue.

\`\`\`guide-screenshot
dashboard
\`\`\`

Worked example: you are a new character in a large state with 96 actions banked after a day away. A pass of 6 Campaign (6 actions at PI under 20), 1 ad (7 actions at Favorability 50) and 1 Fundraise (3 actions) costs 16 actions and a net ₳202,800 of Campaign Funds (₳120,000 for Campaign, plus ₳140,000 for the ad, minus a ₳57,200 Fundraise yield at donor level 1 and PI 10). You still have 80 actions left, and the pass is paid for by a few hours of income. On most days funds, not actions, are what limit you.

**Log in hourly when:**

- It is the last 4 turns of a close general.
- A cabinet confirmation has a 24-hour window and you are a Senator.
- A confidence vote is live in your parliament.
- A bill you care about is about to close and you still need to whip or switch votes.

**Once a day or so, also:**

1. Open **Elections** and confirm you have not missed a primary declaration.
2. Compare PI, Favorability and donor level with your next race.
3. If you drifted on bills, your party alignment and bonus actions got worse. Skim your vote history.
4. Help an ally: a Barnstorm or an NPP endorsement is cheaper than running yourself every cycle.

\`\`\`guide-screenshot
elections
\`\`\`

### The election cycle

1. **Build** (no race open for your office): Campaign, ads, donor network, party influence.
2. **Primary:** Elections, then the race, then declare. Your standing is your alignment plus Favorability plus PI. Over the primary's closing window your party's registered voters cast ballots split by that standing, and the top count per party advances (for president, pledged delegates).
3. **General:** the same race page with a live tally. Sustain PI and Favorability through the last 4 turns and use **View Campaign** to spend.

\`\`\`guide-screenshot
campaign
\`\`\`

4. **Resolution:** the winner takes office, and a new cycle of that office starts immediately.
5. **In office:** legislature and cabinet tools unlock, and you still face re-election.

![The election cycle from build to primary, general, resolution and in office, with the last four turns of the general marked.](/wiki-images/diagrams/the-game-loop-election-cycle.svg)

Safe to ignore in week one: tiny Favorability drift, Infamy under 20, uncontested NPP primaries and most news posts. Not safe to ignore: missed primary declarations, last-turn generals, cabinet votes if you are a Senator, confidence votes and drifting far from your party.

## Your first week

- [ ] Daily Dashboard pass (notifications, Campaign, one ad or fundraise).
- [ ] Elections page checked so a primary window cannot close unseen.
- [ ] Favorability held at 60+; PI climbing, not rotting.
- [ ] You know whether you are in Build, Primary, or General.
- [ ] Last-4-turns alarm set if a general is live.

## Connections

**Driven by**

- [Core Systems](/wiki/core-systems): the hourly turn, the action cap and the hoarding rule set the rhythm.
- [Election Mechanics](/wiki/election-mechanics): primary and general windows and the vote-weight curve decide when timing matters.

**Affects**

- [Getting Started](/wiki/getting-started): how often a new player needs to log in.
- [First Campaign Walkthrough](/wiki/first-campaign-walkthrough): the daily and last-4-turns routine in that plan.
- [Campaign Strategy](/wiki/campaign-strategy): when to spend, and when to save for the closing turns.
- [National Doctrine](/wiki/national-doctrine): The game calendar sets the doctrine era, unlocks nodes by decade and pays one doctrine point a year.

## Status

The hourly turn applies in every normal multiplayer world. Races, windows and offices differ by country and era, so a UK or German cycle has its own shorter phases. See [Core Systems](/wiki/core-systems) for term lengths.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact turn order is on [Reference: Turn Order](/wiki/reference-turn-order), and the numbers behind the rhythm are on the [Turn processing design page](https://docs.lakesidegames.net/design/turn-processing.html).
`;
