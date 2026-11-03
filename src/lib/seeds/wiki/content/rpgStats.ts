export const rpgStatsContent = `# RPG Stats & Debates

Two politicians with the same money and offices can play very differently, and the seven stats are why. Stats change how much your actions deliver, how big an action stockpile you can hold (see [Core Systems](/wiki/core-systems)), and how you do in election debates. You set them when you create the character, and they grow slowly with the actions you repeat, as described in [Stats and Actions](/wiki/stats-actions).

## What a stat point is worth

Each stat runs from 1 to 10. Six of them are an **effectiveness multiplier** applied to what the action produces. Some also divide the money cost of specific actions by the same multiplier; those cases are named in the table below. Energy is the exception: it raises your action stockpile limits.

| Stat | Multiplier |
| --- | --- |
| 1 | 0.82x (18% less) |
| 2 | 0.86x |
| 3 | 0.90x |
| 4 | 0.94x |
| 5 | 0.98x |
| 6 | 1.02x |
| 7 | 1.06x |
| 8 | 1.10x |
| 9 | 1.14x |
| 10 | 1.18x (18% more) |

\`\`\`
multiplier = 1 + (stat - 5.5) x 0.04
\`\`\`

### The seven stats

| Stat | What it does | What trains it |
| --- | --- | --- |
| **Charisma** | More political influence per Campaign, more favorability per ad, bigger gains from [Political Capital](/wiki/political-capital) meetings and boosts. Powers the *Above the fray* debate move | Campaign, Advertise |
| **Debate** | Powers the *Attack* debate move | Debate Prep, debating |
| **Energy** | Raises your action stockpile cap from 200 to 250 and the point where hoarding starts costing you from 100 to 125 | Any action except Debate Prep |
| **Fundraising** | More money per Fundraise (see [Fundraising and Ads](/wiki/fundraising-ads)), cheaper donor base expansion | Fundraise, Build Donor Base |
| **Business Acumen** | Cheaper sector growth, capacity builds and expansions in [corporations](/wiki/corporations) you run as CEO, and high interest rates raise the growth cost less | Holding a CEO seat |
| **Statecraft** | Party whip success from -9 to +9 points ([Voting and Whips](/wiki/voting-and-whips)), longer filibusters ([Cloture and Filibuster](/wiki/cloture-and-filibuster): the 12 hour delay runs from 9.8 hours at Statecraft 1 to 14.2 at 10), stronger ministerial orders. Powers the *Tout accomplishments* debate move | Whipping, filibusters |
| **Intellect** | Cheaper Quick and Full [polls](/wiki/polling), and a lower money cost for Campaigning | Running polls |

Energy does not change how many actions each turn gives you. It changes how many you can save. Above the bank point you lose 4 actions per turn. At Energy 5 the cap is 222 and the bank point is 111, and both rise in a straight line to 250 and 125 at Energy 10.

### How stats grow and fade

- Every qualifying action adds 0.03 progress to its stat, and the turn adds it in. About 34 Fundraise actions raise Fundraising by a full point. Energy gets 0.03 from every action except Debate Prep.
- Business Acumen grows once per turn while you are CEO, scaled by that corporation's profit margin: 0.5x if it loses money, 1x up to a 10% margin, 1.5x up to 25%, 2x above that. At best it takes about 17 turns for a point.
- Stats do not decay from idleness. The one exception is **Debate**, which loses 1 point every 72 hours of real time on a fixed clock, down to a floor of 1. Practice does not pause the clock, it only gives you chances to earn the point back.
- Debate rises two ways. Debate Prep costs 1 action and has a 15% chance of +1. Each debate you take part in gives a practice roll for +1: 30% if you won, 15% if you lost or drew.

### Election debates

When you are a candidate, an opponent may challenge you; the challenge is rolled in the same pass as [player random events](/wiki/player-events), and a debate this turn blocks a normal offer. Each turn there is a flat 50% chance (your stats do not change it), and a candidate can be drawn into at most 3 debates per election. You get **12 hours** to choose one strategy. Each strategy scores \`8 x your stat's multiplier + a random roll\`, and the two sides' scores are compared.

| Strategy | Stat | Roll range | In practice |
| --- | --- | --- | --- |
| Attack opponent | Debate | -6 to +10 | Highest ceiling, can lose badly |
| Remain above the fray | Charisma | -1 to +2 | Safe, small upside |
| Tout accomplishments | Statecraft | -3 to +4 | Base 8 is scaled by your record |

Tout's base is multiplied by a record factor: 0 offices held is -0.3 (a backfire), 1 office is 0.22, 2 offices is 0.74, and 3 or more is 1.0.

A gap under 2 points is a draw. Otherwise the winner gains and the loser loses favorability equal to 3 plus 1 for every further 4 points of gap, up to 8, which feeds into [Election Mechanics](/wiki/election-mechanics). If you do not choose in 12 hours, the game picks your best-fitting strategy for you.

### Dana picks a debate strategy

Dana has Debate 8, Charisma 6 and Statecraft 5, and has held one office. Her options average:

- Attack: 8 x 1.10 = 8.8, plus a roll of -6 to +10 (average +2). About 10.8, but anywhere from 2.8 to 18.8.
- Above the fray: 8 x 1.02 = 8.16, plus -1 to +2. About 8.7, between 7.2 and 10.2.
- Tout: 8 x 0.22 x 0.98 = 1.7, plus -3 to +4. About 2.2.

She attacks for the best average, or goes above the fray if she cannot afford a bad result. If she scores 14 against an opponent's 9, the gap is 5, so the swing is 3 + 0 = 3 favorability each way. A 12 point gap would give 3 + 2 = 5.

## Building your character

- **Allocate stats at creation.** You have 28 points across the seven stats. Each starts at 1, which spends 7 and leaves 21 free to place. The cap is 10 per stat.
- **Reallocate once.** On your own profile, the Stats panel has one free full reallocation per character. It rewrites the 28 point spread and clears earned growth, and it resets the Debate clock. Characters that existed before stats were introduced were given a suggested build to confirm.
- **Train what you use.** Repeat the action that matches the stat you want.
- **Take Debate Prep.** One action, 15% for +1 Debate. Worth it only when a debate is close.
- **Answer debate challenges.** They arrive as events. Pick the strategy that matches your strongest stat.

Typical builds:

- **Campaign machine:** Charisma, Fundraising, Energy.
- **Legislator:** Statecraft and Debate.
- **Mogul:** Business Acumen and Intellect.

Tips:

- A few strong stats beat seven middling ones, because each point is worth only 4%.
- Debate falls away on its own clock, so train it shortly before an election rather than months ahead.
- Letting a debate expire is not a disaster, since the game picks your best fit.

Applies in every world; characters made before the stat system arrived have a suggested build they can confirm, and non-player politicians use neutral stats (5.5) in debates. Last checked 2026-10-29, version 1.18.0. Exact rules: no separate design page covers the stat constants yet, so the tables on this page are the reference.
`;
