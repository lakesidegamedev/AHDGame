export const firstCampaignWalkthroughContent = `# First Campaign Walkthrough

You have 25 actions, ₳250,000 and about six days before a Pennsylvania State Senate primary. This is that campaign played out day by day, with real numbers, from the first click to the last four turns. Other countries use the same clicks with different office names. The kit below is what you get from [Create a Character](/wiki/create-a-character), so do that first if you have not. It follows the plan in [Campaign Strategy](/wiki/campaign-strategy) and expands the overview in [Getting Started](/wiki/getting-started).

The numbers below assume a state with average GDP per person (costs multiplied by 1.0), a large state (Pennsylvania has more than 8 million people), and neutral stats. Your own costs will differ a little, and the in-game quote shows the exact figure before you click.

## Before you spend anything

- Home: Pennsylvania. Sliders: Economic -2, Social -1.
- Open **Parties** and join the Democrats (close to those sliders). To run as an Independent instead, skip this and see the variant at the end.
- Kit: 25 actions, ₳250,000 Campaign Funds, personal Cash on Hand from your wealth background (₳1,000,000, ₳2,500,000 or ₳5,000,000), Favorability 50, Political Influence (PI) 10, donor level 1.
- Target: Pennsylvania State Senate, primary in about 6 real days.

\`\`\`guide-screenshot
dashboard
\`\`\`

## What actually limits you

Actions are not your limit after the first day: you get 4 more every hour, which is 96 a day. **Funds are the limit.** Passive income in a large state is about ₳20,440 per turn at donor level 1 and PI 10 (₳20,000 base plus the donor bonus), roughly ₳490,000 a day before party tax. Campaign costs ₳20,000 per use below PI 20 and ₳48,000 per use from PI 20 to 39. Plan your spending around that, not around actions. The income and ad rules behind this ledger are in [Fundraising & Ads](/wiki/fundraising-ads).

![The four campaign weeks with their targets, and the day one ledger of actions and funds.](/wiki-images/diagrams/first-campaign-walkthrough-four-weeks.svg)

| Cost | Value |
| --- | --- |
| Campaign, PI under 20 | 1 action, ₳20,000, +1 PI |
| Campaign, PI 20 to 39 | 2 actions, ₳48,000, +1 PI |
| Run Advertisements, Favorability 50 to 69 | 7 actions, ₳140,000, +3 Favorability |
| Quick Poll | 2 actions, ₳25,000 |
| Full Demographic Poll | 6 actions, ₳75,000 |
| PI lost to decay | 0.75% of PI per turn (about 5 a day at PI 30) |

## Week 1: build, do not file yet

**Day 1 clicks** (starting with 25 actions and ₳250,000):

| Step | Actions | Funds after |
| --- | ---: | ---: |
| Build Donor Network (donor 1 to 2) | 4 | ₳245,000 |
| Fundraise, twice (₳59,400 each at donor 2, PI 10) | 6 | ₳363,800 |
| Campaign, eight times (PI 10 to 18) | 8 | ₳203,800 |
| Run Advertisements, once (Favorability 50 to 53) | 7 | ₳63,800 |

That is exactly 25 actions. Do the Fundraises first or you cannot afford the ad. Anything left over, leave for hourly income.

**Days 2 to 5:**

- Each day you earn about ₳490,000 and 96 actions. Campaign enough to climb: PI 18 to 20 costs ₳20,000 a use, then ₳48,000 a use. From PI 30 you lose about 5 PI a day to decay, so about 6 Campaigns a day just hold your place.
- Fundraise once a day. Build Donor Network again when you can afford it (4 actions and about ₳6,000 to ₳8,000 for the next levels).
- Run two or three more ads toward Favorability 60 to 65.
- Day 5: open **Elections**, find the Pennsylvania State Senate race and run a Quick Poll. It costs 2 actions and ₳25,000, and shows your topline and your best and worst five groups.

\`\`\`guide-screenshot
elections
\`\`\`

Stop week 1 when PI is about 30, Favorability is 60 or higher, donor level is 3 and you have read the poll.

**If the poll shows you behind:** do not file blind. A rival 10 points ahead means either a different seat, or a plan: request NPP endorsements, run a Full Demographic Poll (6 actions, ₳75,000) to find which groups to canvass, and spend on those groups. A poll is much cheaper than a lost primary.

## Day 6: the primary closes

Before the primary ends (entry shuts when it does):

1. **Elections**, then the race, then **Declare**. You can hold one candidacy at a time.
2. **View Campaign.** This is where your campaign budget is spent; Campaign actions stay on **Actions**.

\`\`\`guide-screenshot
campaign
\`\`\`

3. Campaign enough to climb toward PI 40. At PI 35, decay is about 6 a day, so 10 Campaigns a day at ₳48,000 (₳480,000) adds about 4 net.
4. Open nearby Democratic NPP profiles and request endorsements (6 actions each).
5. Do not Attack fellow Democrats.
6. Optional: one Full Demographic Poll if you have ₳75,000 and 6 actions.

Your score is alignment plus favorability plus PI (see [Election Mechanics](/wiki/election-mechanics)). It sets your standing; over the closing window of the primary the party's registered voters cast ballots split by that standing, and the top count advances. Hold the lead; do not just grab it on the last turn.

## The general: you are the nominee

You are the nominee. A US State Senate general lasts 24 turns, one real day, and the race page shows turns until resolution. The final 4 turns carry 30% of the vote.

Through those 24 turns:

- Campaign enough to hold PI. Spreading spend beats spending early and then decaying.
- An ad or two to hold Favorability at 65 to 70.
- Collect general-phase endorsements.
- If Favorability drops 5 or more points, someone is attacking you. Ads first; Attack only if you accept the Infamy.

If you are clearly ahead by mid-general, stop spraying money. Save for the last 4 turns.

## The last four turns

1. Log in hourly if you can (the routine is in [The Game Loop](/wiki/the-game-loop)). Each turn counts ballots weighted at 7.5% of the pool.
2. Peak Favorability and PI going into those turns (ads plus Campaign).
3. Do not withdraw. Withdrawing costs nothing in actions, but the campaign spend you put in is gone and the race goes to your rivals.

## Election night

The race page posts totals. The winner's profile shows the office. You gain the State Senate action and fund bonus (+1 action and ₳3,000 per turn) and appear on the officials list. A new cycle of that office spawns at once. Open the **legislature** to vote. Winning here puts you on the first rung of [Player Progression](/wiki/player-progression).

\`\`\`guide-screenshot
legislature
\`\`\`

### If you lose

PI, Favorability and donor level stay. Your funds are probably spent, and hourly income plus Fundraise rebuild them. The next cycle of that seat starts right away, so check **Elections**. You begin it well ahead of week 1.

### Independent variant

An Independent enters the independent primary rather than a party's. You get no party action pool, party platform or party organization, so you rely more on your own endorsements and funds. The clicks are the same. See [Political Parties](/wiki/political-parties) for what you give up.

## Your first week

- [ ] Party joined Day 1.
- [ ] Campaign, donor and one ad before any declare.
- [ ] Quick Poll before declare.
- [ ] Primary declared on time.
- [ ] Campaign page used daily, not only the race board.
- [ ] Last-4-turns plan written down (hourly login).

## Where first campaigns go wrong

- Declaring blind (no poll).
- Dumping all your funds early, then decaying into the final turns.
- Running ads when Favorability is already above 70: each ad gives less (3 minus 0.1 for every point over 70, rounded down, never less than 1), and Favorability above 60 drains on its own.
- Attacking your own primary.
- Ignoring NPP endorsements.

Works in any world where you can create a character in a country with elections, with office names and timings that vary; the Pennsylvania State Senate is the US example. Last checked 2026-10-29, version 1.18.0. Exact rules: [Campaign Strategy (design)](https://docs.lakesidegames.net/design/campaign-strategy.html)
`;
