export const subsidiesContent = `# Subsidies

Your steel sector runs a thin margin, and a bill in Congress would add 7.5 percentage points to it. A subsidy is a standing government support program that raises the profit margin of qualifying corporation sectors. A legislature passes one by bill to back a particular industry, and it costs the government budget money every turn. As a legislator you pick winners; as a corporation owner you want your sectors to qualify.

Each active subsidy gives a **+7.5 percentage point profit margin bonus** to every qualifying corporation sector. Subsidies are not a one-time payment: they persist as active policy until another bill ends them, providing a continuous margin boost every turn.

| Rule | Value |
| --- | --- |
| Margin bonus per qualifying subsidy | +7.5 percentage points |
| Stacking | Different subsidies add together |
| Annual cost to the government | Realized sector revenue per turn x 48 x 0.105 |
| Sentiment pulse when a sector subsidy starts or ends | +8% to +15% / -8% to -15% (default 10%) |
| Sentiment pulse decay | 0.85 per 15-minute market interval (about half gone in an hour) |
| Sentiment cap | plus or minus 25% |

## Writing the bill

Subsidies are created through the [legislation system](/wiki/bills-legislation). A bill is the only way to start or end a subsidy. A bill containing a \`subsidy\` provision, when passed and enacted, creates or updates a subsidy record. Draft one from the bill drafting screen, choosing scope, target sector, optional strategy and domestic only. Use sector scope for targeted industrial policy, since economy-wide subsidies cost the most.

The key parameters in a subsidy provision:

| Parameter | Options | Effect |
| --- | --- | --- |
| Scope | \`national\` or \`state\` | Whether the subsidy covers an entire country or a single state |
| Scope type | \`economy_wide\` or \`sector\` | Whether all sectors qualify or only a specific sector type |
| Target sector | e.g. \`extraction\`, \`healthcare\` | Only used when scope type is \`sector\` |
| Target strategy | e.g. \`oil_gas\`, \`iron_mining\` | Optional; further restricts to sectors using a specific operating strategy |
| Domestic only | \`true\` or \`false\` | If true, only corporations headquartered in the territory qualify |

Re-enacting the same combination of parameters (scope, scope type, target sector, target strategy) updates the existing subsidy rather than creating a duplicate.

To end one, pass a bill with an end-subsidy provision (\`end_subsidy\`). It marks the matching subsidy as \`active: false\`. The record is preserved for historical audit purposes but no longer applies to margin calculations, and termination takes effect the turn the enacting bill is processed.

## Does my sector qualify?

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

Active subsidies are visible in the national Congress view and in the legislation history for the enacting bill. Each subsidy's scope, target, and domestic-only flag are displayed, along with the bill that created it. Check it for subsidies your sectors qualify for, then pick the strategy and location that match them.

![Congress Subsidies tab listing active subsidies with scope, domestic-only flag and margin](/wiki-images/screens/subsidies-active-list.webp)

### Home teams and foreign firms

The \`domesticOnly\` flag is the primary tool for targeting subsidies at home-country corporations.

**\`domesticOnly: false\`** (default): Any corporation operating in the territory qualifies, including foreign-headquartered corporations. This boosts all extraction or manufacturing in a territory regardless of where the profits ultimately flow.

**\`domesticOnly: true\`**: Only corporations headquartered in the territory (or the specific state) qualify. This is the standard approach for industrial policy aimed at protecting or growing national champions.

Combined with [Tariffs](/wiki/tariffs) (which penalize foreign corporations), a legislature can create a two-sided policy: domestic corporations get subsidies while foreign competitors face margin penalties, and the margins add together.

## Stacking

Multiple subsidies can apply to the same sector, and their bonuses stack additively:

| Active subsidies | Total margin bonus |
| --- | --- |
| 1 federal economy-wide | +7.5pp |
| 1 state sector subsidy | +7.5pp |
| 1 federal + 1 state (same sector) | +15pp |
| 1 federal economy-wide + 1 federal sector | +15pp |

**Important:** Multiple subsidies of the same exact scope and type do not stack: re-enacting the same provision overwrites the existing record rather than creating a second one. But a federal economy-wide subsidy and a federal sector-specific subsidy for the same sector **do** stack (they are different records). A federal subsidy and a state subsidy also stack freely, since they are different scope levels.

A pharmaceutical company with healthcare sectors in Germany qualifies for:
- A Germany-wide economy-wide subsidy: +7.5pp
- A Germany healthcare sector subsidy: +7.5pp
- A Bavaria healthcare sector subsidy (if operating in Bavaria): +7.5pp

Total margin bonus: **+22.5pp**, a substantial boost that can make the difference between a marginal and highly profitable operation.

## What it costs the government

Subsidies are not free. Every turn, the system calculates the total cost of all active subsidies and writes it into the relevant budget:

- **Cost basis:** Under plants, sum realized revenue for qualifying sectors, multiply by 48 (turns per year), then by \`0.105\`. That is 10.5% of the sector's annual realized revenue.
- **Currency normalization:** Sector revenues are converted to the anchor currency via each corporation's FX rate before summing, so cross-currency corporations weight consistently.
- **Budget impact:** The annualized total is written to \`spending.byCategory.sectorSubsidies\` under the federal budget for national subsidies, or the relevant state budget for state subsidies.

A large economy-wide subsidy covering many high-revenue sectors can create a significant budget line item. For example, a sector with realized revenue of ₳1,000,000 per turn costs ₳1,000,000 x 48 x 0.105 = ₳5,040,000 a year, and it gains 7.5 percentage points of margin, worth ₳75,000 per turn, or ₳3,600,000 a year. The government pays 1.4 times what the sector gains. The cost updates every turn, so subsidy creation and termination are immediately reflected in the fiscal picture.

## How the market reacts

When a **sector-scoped subsidy** is enacted, the market reacts with a sentiment pulse:

- **Subsidy created:** +8% to +15% sentiment multiplier for the targeted sector type (default +10%)
- **Subsidy ended:** -8% to -15% sentiment multiplier for the targeted sector type

Sentiment pulses decay at rate **0.85 per 15-minute market interval** (a pulse loses about half its strength in roughly an hour) and are subject to the global sentiment cap of ±25%. Only sector-scoped subsidies fire a pulse.

## Where the bonus lands each turn

Subsidy margin modifiers are calculated during sector processing each turn:

1. All active subsidies for the relevant country are loaded.
2. For each corporation sector, the system checks every subsidy against all four qualification filters.
3. Qualifying subsidies are summed: each adds +7.5pp to the total margin modifier.
4. The modifier is added to the sector's profit margin.

The calculation runs as part of the corporation turn phase: see [Corporations](/wiki/corporations) for the broader context of how margins affect revenue and sector health, and how the sector's revenue sets what the subsidy costs. Extraction-sector subsidies make resource-rich states more productive; see [Resources](/wiki/resources-overview).

Subsidies work in any country where legislators can pass an industry bill with a subsidy provision, at national or state level. Domestic-only subsidies favour firms headquartered in the territory. Last checked 2026-10-29, version 1.18.0. Exact rules: [Subsidies (design)](https://docs.lakesidegames.net/design/subsidies.html)
`;
