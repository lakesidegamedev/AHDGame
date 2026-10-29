export const subsidiesContent = `# Subsidies

A subsidy is a standing government support program that raises the profit margin of qualifying corporation sectors. A legislature passes one by bill to back a particular industry, and it costs the government budget money every turn. It matters to you either way: as a legislator you pick winners, and as a corporation owner you want your sectors to qualify.

## How it works

Each active subsidy gives a **+7.5 percentage point profit margin bonus** to every qualifying corporation sector. Subsidies are not a one-time payment: they persist as active policy until another bill ends them, providing a continuous margin boost every turn.

### Key numbers

| Rule | Value |
| --- | --- |
| Margin bonus per qualifying subsidy | +7.5 percentage points |
| Stacking | Different subsidies add together |
| Annual cost to the government | Realized sector revenue per turn x 48 x 0.105 |
| Sentiment pulse when a sector subsidy starts or ends | +8% to +15% / -8% to -15% (default 10%) |
| Sentiment pulse decay | 0.85 per 15-minute market interval (about half gone in an hour) |
| Sentiment cap | plus or minus 25% |

### Enacting a subsidy

Subsidies are created through the [legislation system](/wiki/bills-legislation). A bill containing a \`subsidy\` provision, when passed and enacted, creates or updates a subsidy record.

The key parameters in a subsidy provision:

| Parameter | Options | Effect |
| --- | --- | --- |
| Scope | \`national\` or \`state\` | Whether the subsidy covers an entire country or a single state |
| Scope type | \`economy_wide\` or \`sector\` | Whether all sectors qualify or only a specific sector type |
| Target sector | e.g. \`extraction\`, \`healthcare\` | Only used when scope type is \`sector\` |
| Target strategy | e.g. \`oil_gas\`, \`iron_mining\` | Optional; further restricts to sectors using a specific operating strategy |
| Domestic only | \`true\` or \`false\` | If true, only corporations headquartered in the territory qualify |

Re-enacting the same combination of parameters (scope, scope type, target sector, target strategy) updates the existing subsidy rather than creating a duplicate.

### Qualification rules

A corporation sector qualifies for a subsidy if it passes all four filters:

**1. Territory filter**
- For a *national* subsidy: the sector must be operating in that country.
- For a *state* subsidy: the sector must be physically located in that specific state.

**2. Sector type filter**
- If the subsidy targets a specific sector type (\`sector\` scope), the sector's type must match.
- Economy-wide subsidies skip this check.

**3. Strategy filter** (optional)
- If the subsidy specifies a required strategy, the sector's active operating strategy must match.
- Sectors using the default \`standard\` strategy are checked against \`"standard"\`.

**4. Domestic-only filter**
- If \`domesticOnly: true\`, the corporation's headquarters must be in the subsidized territory.
  - National subsidy: corporation's country must match.
  - State subsidy: corporation's headquarters state must match.
- If \`domesticOnly: false\`, foreign corporations operating in the territory also qualify.

![A sector passes the territory, sector type, strategy and domestic-only filters to qualify, and the government pays a per-turn cost into the sector subsidies budget line.](/wiki-images/diagrams/subsidies-qualification-funnel.svg)

### Stacking rules

Multiple subsidies can apply to the same sector, and their bonuses stack additively:

| Active subsidies | Total margin bonus |
| --- | --- |
| 1 federal economy-wide | +7.5pp |
| 1 state sector subsidy | +7.5pp |
| 1 federal + 1 state (same sector) | +15pp |
| 1 federal economy-wide + 1 federal sector | +15pp |

**Important:** Multiple subsidies of the same exact scope and type do not stack: re-enacting the same provision overwrites the existing record rather than creating a second one. But a federal economy-wide subsidy and a federal sector-specific subsidy for the same sector **do** stack (they are different records). A federal subsidy and a state subsidy also stack freely, since they are different scope levels.

#### Stacking example

A pharmaceutical company with healthcare sectors in Germany qualifies for:
- A Germany-wide economy-wide subsidy: +7.5pp
- A Germany healthcare sector subsidy: +7.5pp
- A Bavaria healthcare sector subsidy (if operating in Bavaria): +7.5pp

Total margin bonus: **+22.5pp**, a substantial boost that can make the difference between a marginal and highly profitable operation.

### Market sentiment

When a **sector-scoped subsidy** is enacted, the market reacts with a sentiment pulse:

- **Subsidy created:** +8% to +15% sentiment multiplier for the targeted sector type (default +10%)
- **Subsidy ended:** -8% to -15% sentiment multiplier for the targeted sector type

Sentiment pulses decay at rate **0.85 per 15-minute market interval** (a pulse loses about half its strength in roughly an hour) and are subject to the global sentiment cap of ±25%. Only sector-scoped subsidies fire a pulse.

### Ending a subsidy

An \`end_subsidy\` provision in a new bill marks the matching subsidy as \`active: false\`. The record is preserved for historical audit purposes but no longer applies to margin calculations.

Subsidy termination takes effect the turn the enacting bill is processed.

### Fiscal cost

Subsidies are not free for the government. Every turn, the system calculates the total cost of all active subsidies and writes it into the relevant budget:

- **Cost basis:** Under plants, sum realized revenue for qualifying sectors, multiply by 48 (turns per year), then by \`0.105\`.
- **Currency normalization:** Sector revenues are converted to the anchor currency via each corporation's FX rate before summing, so cross-currency corporations weight consistently.
- **Budget impact:** The annualized total is written to \`spending.byCategory.sectorSubsidies\` under the federal budget for national subsidies, or the relevant state budget for state subsidies.

A large economy-wide subsidy covering many high-revenue sectors can create a significant budget line item. For example, a sector with realized revenue of ₳1,000,000 per turn costs ₳1,000,000 x 48 x 0.105 = ₳5,040,000 a year, and it gains 7.5 percentage points of margin, worth ₳75,000 per turn, or ₳3,600,000 a year. The government pays 1.4 times what the sector gains. The cost updates every turn, so subsidy creation and termination are immediately reflected in the fiscal picture.

### Domestic vs. foreign targeting

The \`domesticOnly\` flag is the primary tool for targeting subsidies at home-country corporations:

**\`domesticOnly: false\`** (default): Any corporation operating in the territory qualifies, including foreign-headquartered corporations. This boosts all extraction or manufacturing in a territory regardless of where the profits ultimately flow.

**\`domesticOnly: true\`**: Only corporations headquartered in the territory (or the specific state) qualify. This is the standard approach for industrial policy aimed at protecting or growing national champions.

Combined with tariffs (which penalize foreign corporations), a legislature can create a two-sided policy: domestic corporations get subsidies while foreign competitors face margin penalties.

### Integration with turn processing

Subsidy margin modifiers are calculated during sector processing each turn:

1. All active subsidies for the relevant country are loaded.
2. For each corporation sector, the system checks every subsidy against all four qualification filters.
3. Qualifying subsidies are summed: each adds +7.5pp to the total margin modifier.
4. The modifier is added to the sector's profit margin.

The calculation runs as part of the corporation turn phase: see [Corporations](/wiki/corporations) for the broader context of how margins affect revenue and sector health.

### Viewing active subsidies

Active subsidies are visible in the national Congress view and in the legislation history for the enacting bill. Each subsidy's scope, target, and domestic-only flag are displayed, along with the bill that created it.

## What you can do

- **Legislators:** draft a bill with a subsidy provision from the bill drafting screen, choosing scope, target sector, optional strategy and domestic only. Tip: use sector scope for targeted industrial policy, since economy-wide subsidies cost the most.
- **Legislators:** end one with a bill containing an end-subsidy provision.
- **Corporation owners:** check the Congress view for subsidies your sectors qualify for, then pick the strategy and location that match them.
- **Tip:** pair a domestic-only subsidy with [Tariffs](/wiki/tariffs) for two-sided industrial policy.

![Congress Subsidies tab listing active subsidies with scope, domestic-only flag and margin](/wiki-images/screens/subsidies-active-list.webp)

## Common questions

- **What subsidies exist and does my sector get one?** Whatever Congress has enacted. Your sector qualifies if it passes the territory, sector type, strategy and domestic-only filters.
- **Do subsidies stack?** Yes, different subsidies add +7.5pp each. Re-enacting the same combination replaces the old record.
- **What does a subsidy cost the government?** 10.5% of the sector's annual realized revenue (per-turn revenue x 48 x 0.105).
- **How do I end one?** Pass a bill with an end-subsidy provision. It takes effect the turn the bill is processed.

## Connections

**Driven by**

- [Bills & Legislation](/wiki/bills-legislation): a bill is the only way to start or end a subsidy.
- [Corporations](/wiki/corporations): the sector's revenue sets what the subsidy costs.
- [Tariffs](/wiki/tariffs): Used alongside tariffs in industrial policy; the margins add together.

**Affects**

- [Corporations](/wiki/corporations): the margin bonus raises sector profit.
- [Resources](/wiki/resources-overview): extraction-sector subsidies make resource-rich states more productive.
- [Tariffs](/wiki/tariffs): paired with subsidies to favour domestic firms.

## Status

Subsidies work in any country where legislators can pass an industry bill with a subsidy provision, at national or state level. Domestic-only subsidies favour firms headquartered in the territory.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants and edge cases are on the [subsidies design page](https://docs.lakesidegames.net/design/subsidies.html).
`;
