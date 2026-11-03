export const canvassingContent = `# Canvassing

Ads move how much voters like you. Canvassing moves how many of a group show up at all, and it is the only personal action that directly changes **voter turnout** for one demographic group in one state (party get-out-the-vote and suppression budgets also move turnout). It is cheap, targeted and single-state, and it is worth double in the final 4 turns of an election. It pays off most in the last turns, in groups that already lean your way. A Full Poll in [Polling](/wiki/polling) shows which groups to target and how well they turn out.

## What one canvass does

Each canvass takes **1 action and ₳100**, and adds a turnout boost to the group you choose. Then four rules shape the result:

1. **Fit.** The closer your positions are to the group's, the bigger the boost. Fit is squared, so a poor match is nearly wasted.
2. **Season.** In the final 4 turns before an election in your state (or before a presidential election, for any state in that country), each canvass is worth double.
3. **Headroom.** The boost shrinks as the group's modifier nears the +20 cap.
4. **Decay.** Every turn, modifiers lose about 10.9% of their value (a 6-turn half-life).

The group's size, turnout and leanings from [Demographics](/wiki/demographics) set what a turnout boost is worth, and the ₳100 comes from campaign funds ([Fundraising and Ads](/wiki/fundraising-ads)). The modifier is a change to that group's turnout in that state. It helps whichever candidates the group favors, so pick groups that lean your way.

Why it works this way: canvassing a group that already agrees with you is efficient, and a late burst beats an early one, which keeps late-game campaigning decisive without letting early money pile up.

### The numbers

| Item | Value |
| --- | --- |
| Cost per canvass | 1 action and ₳100 |
| Base boost per action | 2.0 points of turnout modifier |
| Boost in the final 4 turns | 2x |
| Modifier cap | plus or minus 20 |
| Headroom scaling | boost x (1 - current modifier / 20) |
| Decay | Halves every 6 turns (about 10.9% per turn) |
| Fit | 0.2 + 0.8 x exp(-distance squared / 18), floor 0.2 |
| Canvasses per batch | up to 50 |

### Fit

Distance squared is the average of the squared economic gap and squared social gap between you and the group. The boost is the base 2.0 times fit squared.

| Gap on each axis | Fit | Boost per action (normal) |
| --- | --- | --- |
| 0 | 1.00 | 2.00 |
| 1 | 0.96 | 1.83 |
| 2 | 0.84 | 1.41 |
| 3 | 0.69 | 0.94 |
| 5 | 0.40 | 0.32 |
| 8 | 0.22 | 0.10 |

At the floor you keep 4% of the base boost, so canvassing a group far from you throws actions away.

### Headroom and decay

The more turnout a group already has, the less each canvass adds. The scaling factor is 1.0 at modifier 0, 0.75 at +5, 0.5 at +10, 0.25 at +15 and 0 at +20. A modifier of +10 becomes +8.9 a turn later and about +6.3 after 4 turns without reinforcement.

\`\`\`wiki-chart
canvassing-headroom
\`\`\`

\`\`\`wiki-chart
canvassing-decay
\`\`\`

### Stacking canvasses

Say you are 1 point away from a group on each axis, so each canvass gives 1.83 points. The first canvass takes the modifier from 0 to 1.83. The second adds 1.83 x (1 - 1.83/20) = 1.66 for a total of 3.49. A perfectly aligned candidate needs 7 canvasses to reach +10 and 15 to reach about +16. In the final 4 turns the base is 4 points, so 4 canvasses reach +11.8 and 5 reach +13.5.

Timing: a modifier built 10 turns before the election keeps only about a third of its value on election day. To land +15 four turns out, you would need about +24 today, above the cap. Canvass in the final 1 to 3 turns.

## Picking a group and a place

- **Pick a category and a group** on the campaign page, then canvass. The 21 groups are:

![Voter canvassing form with demographic category, specific group, quantity and the cost line](/wiki-images/screens/canvassing-canvass-dialog.webp)

| Category | Groups |
| --- | --- |
| Race | White, Black, Hispanic, Asian, Other |
| Age | Young (18-29), Middle-Aged (30-49), Mature (50-64), Senior (65+) |
| Education | No College, College Educated, Graduate Degree |
| Wealth | Low Income, Middle Income, High Income |
| Ideology | Evangelicals, Environmentalists, Libertarians, Progressives, Patriots, Gun Owners |

Canvassing targets one group in one category, and the modifier reaches every voter who carries that identity, whatever their other attributes. Outside the US, each country's own voter groups replace these five categories. See [Demographics](/wiki/demographics), and [Demographics & Targeting](/wiki/demographics-targeting) for which group to canvass, since turnout modifiers change which groups matter most in a race. Canvassing and get-out-the-vote work also change segment turnout in [granular polling](/wiki/granular-polling).

- **Where you can canvass:** most characters canvass in their home state or region. An active presidential candidate canvasses the state they are traveling in during the general, or their primary campaign state during the primary. A running mate canvasses the state they are visiting (see [Running Mate Surrogate Campaigning](/wiki/running-mate-surrogate)). Other states are blocked.
- There is no cooldown, so you can canvass the same group several times in a turn.

Tips:

- **Canvass instead of advertising when the group already likes you.** Ads add appeal, and a group at favorability 75 has little left to add. What is left is turnout.
- **Use it on pocket groups.** A group that is 3% of the state with 38% turnout is a 1.14% share of the vote. Five more points of turnout lifts that group's contribution by about 13%.
- **Prefer ads when you are near 50% favorability with a big group,** since a favorability gain on a large group often beats a turnout gain on a small one.
- **Check the modifier first.** At +18, a canvass adds only 10% of its base. Try a fresher group.
- **At ₳100 per action the scarce resource is actions, not money.**

Turnout is what the closing surge in [General Elections](/wiki/general-elections) rewards, because each group casts more ballots and the final-4-turn doubling lines up with it. Canvassing has no line of its own in the [Vote Factor Ledger](/wiki/vote-factor-ledger): it changes how many ballots each group contributes, so it shows up inside the baseline and the group-weighted factors, not in the Turnout line (which is the state-approval turnout scaler). Races that opened before the current campaign rules still use an older, weaker canvassing model, with smaller boosts and slower decay.

Live in every world and country with campaigns, for the groups of that country. Races that opened under the older campaign rules use the older canvassing numbers. Last checked 2026-10-30, version 1.18.0. Exact rules: [Canvassing (design)](https://docs.lakesidegames.net/design/canvassing.html). See also [Stats & Actions](/wiki/stats-actions), [Political Parties](/wiki/political-parties).
`;
