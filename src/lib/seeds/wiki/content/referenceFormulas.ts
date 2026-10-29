export const referenceFormulasContent = `# Reference: Formulas

When your primary score comes out at 70.5 and you want to know where each point came from, this is the page. It holds the math behind primaries, canvassing and general-election votes, with a worked example for each so you can check your own numbers. Read the plain-language line under each heading first; the formula is there for when you want to check a number. Terms like [Political Influence](/wiki/glossary) and [Manhattan distance](/wiki/glossary) are defined in the glossary.

All numbers were checked against the game on 2026-10-29. Values that need a table are given in full; nothing here is rounded unless it says so.

---

## How your primary score is built

The primary score is a candidate's **standing** in a primary. It does not pick the winner on its own. Each turn of the primary's closing window it sets your share of the ballots cast by your party's registered voters, and the running ballot count picks the nominee. Only where a party has no registered voters on file does the raw score decide directly. See [Primaries](/wiki/primaries).

### State-level primary score

Used for US House, US Senate, US Governor, US State Senate, UK Commons, UK Regional Council, DE Bundestag, JP Shugiin and JP Sangiin. The maximum is 100 points before the infamy penalty.

| Component | Range | Formula |
|---|---|---|
| Alignment with the state | 0 to 25 | \`max(0, 25 - (econ gap + social gap) x 1.25)\` against the state's lean |
| Alignment with the party | 0 to 15 | \`max(0, 15 - (econ gap + social gap) x 0.75)\` against the party platform |
| Favorability | 0 to 35 | \`favorability / 100 x 35\` |
| Political Influence | 0 to 25 | \`normalizeNPI(influence) x 25\` (curve below) |

- "Gap" means how far your position is from the target on one axis. Adding the econ gap and the social gap gives the Manhattan distance.
- If the state has no stored lean, the two alignment lines are replaced by one 40-point check against the party: \`max(0, 40 - distance x 2)\`.
- The final score is the raw total times \`1 - 0.05 x infamy / 100\`, with infamy held between 0 and 100. Infamy 100 costs 5%.

| Manhattan distance | State alignment (of 25) | Party alignment (of 15) | Fallback (of 40) |
|---|---|---|---|
| 0 | 25 | 15 | 40 |
| 2 | 22.5 | 13.5 | 36 |
| 5 | 18.75 | 11.25 | 30 |
| 10 | 12.5 | 7.5 | 20 |
| 20 | 0 | 0 | 0 |

**Why it is built this way:** alignment is worth the most (40 of 100) so parties still nominate people who agree with them, but favorability and influence are what you can build, so they decide close races.

**NPP penalty.** When at least one player is in a party's primary, every [NPP](/wiki/glossary) in that primary has its whole score multiplied by 0.5. An NPP at 70 competes as 35. NPPs take no infamy penalty.

#### Scoring a candidate with favorability 60

A candidate has favorability 60, Political Influence 50 and infamy 20. The state's lean is 3 points away and the party's platform is 5 points away.

| Step | Calculation | Points |
|---|---|---|
| State alignment | 25 - 3 x 1.25 | 21.25 |
| Party alignment | 15 - 5 x 0.75 | 11.25 |
| Favorability | 60 / 100 x 35 | 21.00 |
| Influence | sqrt(50 / 100) = 0.7071, x 25 | 17.68 |
| Raw score | sum | 71.18 |
| Infamy penalty | x (1 - 0.05 x 20 / 100) = x 0.99 | **70.5** |

**Why did my score come out as X?** Work down this table with your own numbers. Two more things to know: each point of favorability is always worth 0.35 points of score, while each point of Political Influence is worth about 0.28 points at influence 20 but only about 0.14 at influence 80, because of the curve below.

### Presidential primary score

Used for the US President only. The maximum is 100 points.

| Component | Range | Formula |
|---|---|---|
| Alignment with the party | 0 to 40 | \`max(0, 40 - distance x 2)\` |
| Party influence | 0 to 20 | \`party influence / 150 x 20\`, not capped |
| National reach | 0 to 15 | \`(1 - e^(-NPI / 45)) x 15\` |
| Favorability | 0 to 25 | \`favorability / 100 x 25\` |

- The same infamy penalty applies at the end.
- There is no state alignment: the contest is national, so only the party platform counts.
- Alignment stays on top at 40 so a party never nominates someone it disagrees with for being popular. Favorability is 25 because it is the strongest single driver of the general election.
- Party influence has no ceiling. Above 150 it keeps adding points linearly.

Example: distance 4 from the party, party influence 75, NPI 40, favorability 60. Alignment is 32, party influence 10, reach 0.589 x 15 = 8.83, favorability 15. Total **65.8**.

---

## Why early influence is worth more

Political Influence (PI) and National Political Influence (NPI) are not used raw. They pass through curves that reward early gains more than late ones.

| PI value | State curve: \`sqrt(PI / 100)\` |
|---|---|
| 0 | 0.000 |
| 25 | 0.500 |
| 50 | 0.707 |
| 85 | 0.922 |
| 99 | 0.995 |
| 100 and above | 1.000 (cap) |

The state curve (\`normalizeNPI\`) is used by state primaries and by general-election reach in state and presidential races. Presidential primaries use their own curve for national reach, \`1 - e^(-NPI / 45)\`, which never quite reaches 1.

| NPI | Presidential primary reach |
|---|---|
| 25 | 0.426 |
| 55 | 0.705 |
| 80 | 0.831 |
| 100 | 0.892 |
| 200 | 0.988 |

In general-election votes, reach never drops below 0.1 (the square root of 1/100), so a character with no influence is a steep underdog, not erased.

---

## What one canvass does

Canvassing raises turnout among one group of voters. It costs **100 funds and 1 action** per canvass, and you can send up to 50 in one batch. Everyone canvasses in their home state except presidential candidates, who canvass where they are travelling (general election) or in their primary campaign state (primary). See [Canvassing](/wiki/canvassing).

### Current races (campaign rules version 1)

\`\`\`
distanceSquared = ((your econ - group econ)^2 + (your social - group social)^2) / 2
fit             = 0.2 + 0.8 x e^(-distanceSquared / 18)
boost           = 2 x fit^2 x (closing sprint ? 2 : 1)       // percentage points
resistance      = max(0, sign(boost) x currentModifier) / 20
newModifier     = clamp(currentModifier + boost x (1 - resistance), -20, +20)
\`\`\`

- A **closing sprint** is the last 4 turns before the election ends. Canvassing is twice as strong then.
- The cap is 20 percentage points either way.
- **Resistance** means pushing a group further in the direction it is already pushed gets harder. At +10 you keep 50% of each boost; at +18 you keep 10%. A positive canvass on a group someone suppressed to -10 keeps its full strength.
- **Decay:** every turn each modifier shrinks by a factor of \`2^(-1/6)\`, a half-life of 6 turns (about 11% lost per turn). Modifiers below 0.01 snap to zero.

| Turns since the last canvass | Modifier left |
|---|---|
| 0 | 100% |
| 4 | 63% |
| 6 | 50% |
| 10 | 31% |
| 20 | 10% |

**Worked example.** You sit at econ 2, social 1 and canvass a group at econ 4, social 3. distanceSquared is (4 + 4) / 2 = 4, so fit is 0.2 + 0.8 x e^(-4/18) = 0.841 and the boost is 2 x 0.841^2 = **1.41 points**. In a closing sprint it is **2.83**. If that group already sits at +10, the sprint canvass adds only 1.41. A group exactly at your position gives the full 2.0 (4.0 in a sprint); a group far across the grid gives about 0.24.

### Older races

Races created before campaign rules version 1 still use the earlier formula:

\`\`\`
alignmentMult = max(0.1, 1.0 - distance x 0.15)
boost         = 0.05 x alignmentMult x (campaign season ? 2.0 : 1.0)
\`\`\`

with a 2% per-turn decay. The alignment multiplier hits its 0.1 floor at distance 6.0 (not earlier): distance 0 gives 1.0, distance 3 gives 0.55, distance 5 gives 0.25.

---

## The last four turns of a race

Fundraising, Ground Game, Media Spending and Opposition Research are branch trees on your campaign page. The costs and effects of each branch are in [Campaign Strategy](/wiki/campaign-strategy) and [Campaign Manager](/wiki/campaign-manager). Unaffordable branches downgrade automatically instead of collapsing the whole tree.

In the last 4 turns of a race, two passive effects double each turn: the favorability gain from Media Spending and the favorability drain from Opposition Research. Canvassing doubles too (above).

---

## How general-election votes are counted

### How the vote pool is spread over time

Votes are not spread evenly. The window starts when the general election starts (after the primary). For a window longer than 4 turns:

| Band | Turns | Share of all votes | Per turn |
|---|---|---|---|
| Final | last 4 | 30% | 7.5% each |
| Ramp | up to 8 before the final band | 20% | 20% / ramp turns |
| Early | everything before the ramp | 50% | 50% / early turns |

In a 24-turn window that is 12 early turns at 4.17% each, 8 ramp turns at 2.5% each and 4 final turns at 7.5% each. Windows of 4 turns or fewer split the pool evenly. If there are no early turns, their 50% is folded into the ramp. This is why the last four turns matter so much.

### How one candidate's weight in one group is built

Every turn, for every demographic group in a race, each candidate gets a **weight**. Your share of that group's votes is your weight divided by the total of all candidates' weights. Read the terms as: how well you fit the group (appeal), how many of them know you (reach), how much they like you (approval), and how strong your party's machine is (org).

\`\`\`
reach         = max(0.1, normalizeNPI(influence))
positionRaw   = max(0, 50 - |econ gap| x 5 - |social gap| x 5)
positionScore = 25 x (positionRaw / 50)^1.5 + 0.5
direction     = up to 5 per axis where you lean the group's way
influenceAppeal = (presidential generals only) normalizeNPI(influence) x 12.5
appeal        = positionScore + direction + influenceAppeal
effectiveFav  = clamp(favorability + group approval x 0.5, 0, 100)
approval      = (effectiveFav / 100)^0.8
orgShare      = your party's org in the state / all parties' org in the state
partyOrg      = orgShare^0.2
personalFloor = 0.1 x reach x approval
effectiveOrg  = max(partyOrg, personalFloor)
infamyMult    = 1 - 0.05 x infamy / 100
weight        = appeal x reach x approval x effectiveOrg x infamyMult x other factors
\`\`\`

- **Other factors** include registration resistance, the UK registration baseline, a candidate's Support, campaign presence, NPP and regime multipliers, and coattails where a race has them. The full list is in the technical page linked at the bottom.
- **Direction bonus** is suppressed on an axis where you lean against your own party.
- **Personal floor** means a good candidate with a tiny party is never multiplied down to zero.
- State races use influence for reach only. Presidential generals also add it to appeal.
- The group's approval of you (\`group approval\`) is the per-archetype approval from [Government Approval](/wiki/government-approval) style effects, half-weighted.

### Tenure erosion

When a seat has been held for more than one consecutive term, both influence and favorability are scaled down before the formulas above. Each term beyond the first costs 3% of both, stopping at 15%, so a long-serving officeholder still carries 85% of their reach and approval at worst. First-term holders, open seats and fresh nominees are untouched.

Senate seats and returning House nominees count that person's own unbroken run. The presidency counts the **party's** run, so the erosion follows the incumbent party's nominee whether or not that person held the office before. This is separate from party fatigue in the National Mood, which prices how a party wears a bad economy.

**Example.** A senator in a third consecutive term is two terms beyond the first. Influence 80 and favorability 70 count as 75.2 and 65.8 (94% of each).

### Office strength and the vote pool

Each office has a strength weight that scales the vote pool. US values:

| Office | Strength weight |
|---|---|
| Governor and President | 1.0 |
| House | 0.9 |
| State Senate | 0.85 |
| Senate | 0.8 |

Other countries set their own weights; see [Reference: Offices](/wiki/reference-offices).

---

## What party organization is worth

Party org (0 to 100 per state) feeds the general-election weight as \`(your org / all org in the state)^0.2\`. The 0.2 exponent flattens big gaps:

| Org lead | Share split | Weight advantage |
|---|---|---|
| Even | 50 / 50 | 1.0 : 1 |
| 3 : 1 | 75 / 25 | 1.25 : 1 |
| 10 : 1 | 91 / 9 | 1.58 : 1 |

So tripling your org advantage buys about a quarter more weight, not three times. A state with no org data for any party gives everyone a neutral 1x. A party with 0 org in a state that has org data gets 0 org weight, which only the personal floor above can rescue. Presidential primaries do not use org; they use party influence and national reach.

---

## See also

[Reference: Turn Order](/wiki/reference-turn-order) shows when each of these runs in the hourly turn. [Election Mechanics](/wiki/election-mechanics) gives the full election structure these formulas sit inside, [Primaries](/wiki/primaries) the declaration rules and how NPPs behave, [Canvassing](/wiki/canvassing) how to use the turnout boost in play, and [Campaign Strategy](/wiki/campaign-strategy) the upgrade tables and action allocation. Terms are defined in the [Glossary](/wiki/glossary).

These formulas apply in every world and era. The canvassing rules differ only by race: races created under campaign rules version 1 use the first canvassing model, and older races in progress keep the earlier one. Last checked 2026-10-29, version 1.18.0. Exact rules: [formula deep-dive](https://docs.lakesidegames.net/design/formula-deep-dive.html), which also lists every extra vote factor.
`;
