export const canvassingContent = `# Canvassing

Canvassing is the only action that directly modifies **voter turnout** for a specific demographic group. Ads move your Favorability with a group; canvassing moves how many of that group show up at all. It's cheap, targeted, single-state, and doubles in impact during the final 4 turns of an election.

## Cost and scope

- **1 action + ₳100**
- **Single-state.** Most characters canvass in their home state / region. Active presidential candidates canvass wherever they're currently traveling (general phase) or in their primary campaign state (primary phase). Attempting to canvass anywhere else is blocked.
- No cooldown per action; you can canvass the same group multiple times per turn.

At ₳100 per action, canvassing is the cheapest per-action-spent action in the game. The scarce resource is **actions**, not money.

## Targeting

You pick two things:

1. **Category** (Layer 1): race, age, education, wealth, ideology.
2. **Group** within category (21 total):

| Category | Groups |
| --- | --- |
| Race | White, Black, Hispanic, Asian, Other |
| Age | Young (18-29), Middle-Aged (30-49), Mature (50-64), Senior (65+) |
| Education | No College, College Educated, Graduate Degree |
| Wealth | Low Income, Middle Income, High Income |
| Ideology | Evangelicals, Environmentalists, Libertarians, Progressives, Patriots, Gun Owners |

Canvassing targets one bucket in one category. The modifier reaches every voter carrying that bucket, whatever their other attributes. The four census dimensions are the same ones the vote engine builds its cells from; the fifth, Ideology, is a targeting layer for canvassing (and party GOTV) only, reaching the voters who carry that identity across every census cell. Outside the US, each country's own voter groups stand in for all five. See [Demographics](/wiki/demographics) for how the census builds the electorate the vote engine counts.

## The effectiveness formula

Each canvassing action produces a **turnout modifier boost** in the range −20 to +20 percentage points (clamped). The raw boost is computed and then damped by diminishing returns:

\`\`\`
baseBoost        = 2.0 (percentage points)
distanceSq       = ((charEcon − demoEcon)² + (charSocial − demoSocial)²) / 2
fit              = 0.2 + 0.8 × exp(−distanceSq / 18)      // floor 0.2
seasonMult       = isCampaignSeason ? 2.0 : 1.0
rawBoost         = baseBoost × fit² × seasonMult
adjustedBoost    = rawBoost × (1 − |currentModifier| / 20)   // diminishing returns
newModifier      = clamp(currentModifier + adjustedBoost, −20, 20)
\`\`\`

### Alignment multiplier

Canvassing a group that aligns with your policy positions is vastly more effective than canvassing a misaligned one:

The fit is applied squared. With distance meaning the straight-line gap between your position and the group's lean on the economic and social axes:

| Distance | Fit | Boost multiplier (fit squared) |
| --- | --- | --- |
| 0 (perfect match) | 1.0 | 1.0× |
| 3 | 0.82 | 0.68× |
| 6 | 0.49 | 0.24× |
| 10 | 0.25 | 0.06× |
| Far (floor) | 0.2 | 0.04× |

At maximum misalignment you get 4% of the base boost, effectively money and actions thrown away. Source: \`src/lib/campaignTargeting/rules.ts\`. Races that started before these campaign rules still use the older formula (base 0.05, linear alignment falloff, 2% decay).

### Campaign season multiplier

When an election in your state is active and set to end within the next 4 hours (4 turns), the multiplier doubles to **2.0x**. This is the single biggest reason to canvass: burst-canvass in the final 4 turns of a general.

## Diminishing returns

A modifier already at +10 takes smaller and smaller boosts toward the +20 cap. At +20 exactly, the next boost is 0. The math:

\`adjustedBoost = rawBoost × (1 − |currentModifier| / 20)\`

| Current modifier | Scaling factor |
| --- | --- |
| 0 | 1.0 |
| +5 | 0.75 |
| +10 | 0.5 |
| +15 | 0.25 |
| +20 | 0.0 |

So canvassing a group from 0 to +10 takes fewer actions than canvassing from +10 to +20. Plan accordingly.

## Turnout modifier decay

Every turn, all turnout modifiers decay toward zero with a **6-turn half-life** (about 10.9% of the current value per turn). A +10 modifier becomes ~+8.9 the next turn and ~+6.3 after 4 turns of no reinforcement.

**Decay planning:** If your election resolves 4 turns from now and you want a +15 modifier on election day, starting from scratch a modifier you build now loses about 37% of its value over those 4 turns, so landing +15 on election day would need about +24 today, above the +20 cap. Land the boosts late instead: canvassing in the final 1-2 turns keeps decay losses small.

## Interaction with party GOTV

Party GOTV spending and player canvassing write to the **same** underlying turnout modifier. They stack additively, both subject to:

- The ±20 cap.
- Diminishing returns (based on the current modifier regardless of source).

Turn order within a single turn:

1. All modifiers decay (6-turn half-life).
2. Party GOTV (passive, budget-driven) applies.
3. Canvassing (player action, written at request time) applies immediately on submission, not in turn processing.

Result: a canvass that lands mid-turn hits BEFORE the next turn's decay starts. If you canvass at 23:59, the effect shows up in the next turn's vote-accumulation math.

## Strategic uses

### When canvassing beats ads

- **Group already likes you.** If Favorability is high in a group (say 75), ads diminish; the group's votes are largely secured. What's left is turnout, and canvassing gets more of them to actually show up.
- **Pocket populations.** A group holding 3% of the state at 38% turnout is only a 1.14% share of the vote. Boosting turnout by 5 points moves it to 43%, effectively a 13% relative improvement in that group's contribution.
- **Late-game closing sprint.** The 2× campaign season multiplier makes every action worth 2 normal actions in the final 4 turns.

### When ads beat canvassing

- **You're close to 50% Favorability on a group.** Ads directly lift appeal; a 5-point Favorability gain on a large group often outweighs a 5-point turnout gain on a small group.
- **Statewide ad campaigns** cover multiple groups at once; canvassing is one group at a time.
- **Away games.** Outside of presidential travel, you can't canvass out of state. Ads (with out-of-state multipliers) are your only option.

### Combining with party GOTV

If your party chair is already running GOTV on your aligned demographics, the modifier is already elevated. Check it before you canvass: at +18 modifier, your canvass boosts by only 10% of base. You might get more value canvassing a different group.

## Common mistakes

- **Canvassing groups you don't align with.** At a distance of 6 or more you get under a quarter of the base effect. Wasted action.
- **Starting too early.** Modifiers halve every 6 turns. A canvass 10 turns out has lost about two thirds of its value by election day. Time it for the last 1-3 turns.
- **Ignoring diminishing returns.** If a modifier is at +18, additional canvassing returns ~10% of the base. Go somewhere fresher.
- **Out-of-state attempts.** Always blocked. Don't try.

## Related

- [Stats & Actions](/wiki/stats-actions): Action costs, all actions reference.
- [Demographics & Targeting](/wiki/demographics-targeting): Census composition and appeal math.
- [Demographics](/wiki/demographics): Full demographic system, census buckets, turnout mechanics.
- [General Elections](/wiki/general-elections): The 4-turn campaign season window.
- [Political Parties](/wiki/political-parties): Party GOTV spending and how it interacts.
- [Polling](/wiki/polling): How to diagnose where canvassing has the highest ROI.
`;
