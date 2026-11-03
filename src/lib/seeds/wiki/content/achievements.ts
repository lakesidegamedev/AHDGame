export const achievementsContent = `# Achievements

Win an election, pass a law, place in a weekly contest, and the game quietly pins a badge to your account. Achievements give no gameplay bonus. They matter for two reasons: they are a permanent record that follows your account, and they count toward your career ranking on the all time leaderboard.

## What earns a badge

Achievements belong to your account, not to one character. Retiring a character or starting a new one never removes them. Each one records which of your characters earned it, and an achievement is only ever awarded once.

They are awarded automatically when a game event matches, such as winning an [election](/wiki/elections-player-guide) or an enacted bill (see [Bills and Legislation](/wiki/bills-legislation)), and posting or replying in [News](/wiki/news) can unlock some too. You do not claim them.

There are six categories: Special, Elections, Legislation, Actions, Social and Milestones. A few are **hidden**: they show as a blank tile until you earn them.

### Rarity

Each earned achievement shows what share of players have it and a rarity tier based on that share.

| Share of players who have it | Tier |
| --- | --- |
| Under 1% | Legendary |
| 1% to under 5% | Epic |
| 5% to under 10% | Rare |
| 10% to under 25% | Uncommon |
| 25% or more | Common |

### Contest achievements

[Contests](/contests) has two tabs: Contests (this week's races and your history) and All time leaderboard (career rankings and champions). Results keep the names and scores recorded when the round settled. Cash totals count paid prizes only. Supporter awards are separate.

| Achievement | Requirement |
| --- | --- |
| On the Podium | Earn an awarded contest placing |
| First Across the Line | Win your first contest |
| Returning Champion | Win three rounds |
| Three in a Row | Win three weekly rounds of the same contest in a row, in one iteration |
| All-Round Champion | Win in three different contest categories |
| Champion Through the Ages | Win in two different iterations |

### Supreme Court milestones

A justice confirmed to the [Supreme Court](/wiki/scotus) earns **Equal Justice Under Law** and a career history entry. A justice who dies in office earns **Served for Life**. Earlier confirmations were backfilled when these shipped.

### How the career ranking is scored

The all time leaderboard (offices, influence and net worth come from [Player Progression](/wiki/player-progression)) scores each career out of five areas, then subtracts infamy.

| Area | Most it can give | How it is earned |
| --- | --- | --- |
| Politics | 1,000 | National influence (up to 400), party influence (up to 200), and the highest office you actually held (50 per rank, up to rank 8, so 400) |
| Business | 1,000 | Net worth: all cash and savings in every currency, shares, bonds and funds, less personal loans |
| Legislation | 1,000 | Laws you got enacted |
| Contests | 1,000 | 3 credits per contest win, plus 1 credit per awarded placing (so a win is worth 4) |
| Achievements | 1,000 | Number of earned account achievements, counted once |
| Infamy | -500 at most | 5 points per infamy point |

The total cannot go below zero. Influence, legislation, contests and achievements have diminishing returns: each reaches half its maximum at a set amount (1,000 national influence, 500 party influence, 20 enacted laws, 20 contest credits, 20 achievements) and flattens after that. Business rises by the logarithm of net worth: about 260 points at 100,000, 500 at 1 million, 750 at 10 million, and the 1,000 cap at 100 million.

Drafts, failed bills, staff law overrides, special achievements, paid perks and manual grants earn nothing. Borrowing cash or moving it between your own currency accounts creates no business credit.

### Scoring a sample career

A career with 1,000 national influence, 500 party influence, a highest office of rank 4, 10 million in net worth, 10 enacted laws, one contest win plus two other placings, 15 achievements and 20 infamy:

- Politics: 200 + 100 + 200 = 500
- Business: 750
- Legislation: 1,000 x 10 / (10 + 20) = 333
- Contests: 6 credits (3 for the win, 3 for three placings), 1,000 x 6 / 26 = 231
- Achievements: 1,000 x 15 / 35 = 429
- Infamy: -100

Total about 2,143. The next 10 laws would add only 167, while ten more achievements would add about 127, so spreading effort across areas pays better than stacking one.

The ranking uses your strongest political and business career, then adds enacted laws and contest results across all your characters, and counts account achievements once. Retiring extra characters does not stack their scores. New retirement snapshots save enacted laws and converted balances before a world reset clears them. Information erased before that cannot be rebuilt.

## Finding and chasing them

- **See your achievements.** Your profile shows earned ones as a tile grid. The achievement showcase page groups every achievement by category, shows rarity and totals, and tracks progress toward locked ones that have a countable goal.
- **Choose highlights.** In Settings, under Achievements, pick up to 5 to show first on your profile.
- **Check the leaderboard.** It is also a way to read your own run; see [Reading the Game](/wiki/reading-the-game). Contests, then All time leaderboard. By default it shows your current character, or your latest retired one if none is active. You can choose another recorded character, and the ranking names the career supplying the score.
- **Work out what to chase.** Use the diminishing returns above, and see [Endgame Goals](/wiki/endgame-goals) for the wider picture: early laws, contest placings and achievements are worth the most.

Tips:

- Achievements do not decay and cannot be lost, so there is no wrong time to start.
- Contest placings count even when you do not win, so entering is worth it.

Live in every world and era, for every account. Some achievements are tied to a specific era or event, so they can only be earned while it is running. Last checked 2026-10-29, version 1.18.0. Exact rules: [Achievements (design)](https://docs.lakesidegames.net/design/achievements.html)
`;
