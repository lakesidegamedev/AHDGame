export const nationalMetricsContent = `# National Metrics

Before you cut rates, build a sector or pass a law, check what the country's numbers say. Growth, unemployment and inflation are the headline figures, and under them sit dozens of state measures such as crime, roads, literacy and corruption. Laws, corporations, the central bank and the budget all feed them. They in turn decide how profitable corporations are and how the public rates the government, so reading them tells you where the country is heading.

Each state keeps its own set of metrics. Every turn the game updates them, then rolls them up into national figures. Most national rates are population-weighted averages of the states. GDP growth is weighted by each state's GDP. Unemployment is weighted by each state's labour force. Open a country's Metrics page for national values, rankings of states and history charts; state pages show each state's own metrics.

![Country Metrics page showing the average score, political direction and democratic health](/wiki-images/screens/national-metrics-country-metrics.webp)

## What growth really measures

GDP growth is the change in real output: what the country's sectors actually produce, valued at constant prices so price swings do not count as growth. Sector output and staffing from [Corporations](/wiki/corporations) drive it. The measured trend is smoothed over about a year and carries **40% inertia**, so one noisy turn does not swing the headline. Trade above the world baseline, consumption taxes and crises shift it on top. Crisis effects change state metrics such as GDP and unemployment (see [Crisis Interaction](/wiki/crisis-interaction)).

Nothing pulls growth back toward a target. If output keeps rising fast, growth stays high. If production stalls, growth falls. Growth, wage and trade growth expand the tax bases of the [National Budget](/wiki/national-budget) every turn.

The game also tracks each region's **output trend** (what its own recent growth says is normal) and the **output gap**: how far output sits above or below that trend. Steady growth at any pace settles at a gap of zero. A slowdown opens a negative gap until the trend catches up, which takes a few dozen turns. A gap above zero means the economy is running hot, and below zero means slack. Potential growth (labour force, capital and productivity) is shown as a supply-side indicator but does not set the headline.

## Why unemployment lags

Unemployment is counted from jobs. Each region has a labour force. Corporations post openings for the workers their sectors need, and a background economy employs the rest. Unemployment is the share of the labour force without a job.

\`\`\`wiki-chart
unemployment-output-gap
\`\`\`

- **The output gap sets the target.** A region has a structural rate, the unemployment that exists even in a normal year (4.5% unless local conditions change it). Each point of output gap moves the target by 0.4 points, down when the economy runs hot and up when it is slack. Funded matching, transport and childcare programmes lower the structural rate.
- **Hiring takes time.** At average workforce skill, half of a corporation's open positions fill in 2 turns. The background economy closes half the gap to its target in about 24 turns. A more skilled workforce fills jobs faster.
- **Floor.** Unemployment never reads below 1%.

Where a region has no labour force data, the game falls back to a simple Okun's Law rule: unemployment falls 0.2 points per 1% of growth above trend and rises 0.25 points per 1% below it, with 85% inertia and bounds of 1% to 15%.

Take a region with a 4.5% structural rate and an output gap of +2 points. Its unemployment target is 4.5 - 0.4 x 2 = **3.7%**. Unemployment does not jump there. It slides toward 3.7% over a few dozen turns as corporations fill positions and the background economy hires. That is why unemployment did not fall the moment growth picked up: only growth above trend (a positive output gap) lowers the target.

Unemployment also lowers union organising pressure ([Unions](/wiki/unions)), and feeds the household demand and price index in [Household Demand & Price Level](/wiki/household-economy), alongside confidence, median income and inflation. Wage growth above 2.5% adds cost pressure, see [Labour & Wages](/wiki/labour-and-wages).

## What moves inflation

Inflation moves toward a target built from several pressures. In multiplayer it advances halfway at half past each hour, and the hourly turn applies the rest of the step.

![Eight pressures push inflation, which in turn affects corporate margins and central bank chair scrutiny.](/wiki-images/diagrams/national-metrics-inflation-inputs.svg)

| Pressure | Effect |
| --- | --- |
| Central bank prime rate | Below the country's neutral rate pushes inflation up. Above it pulls inflation down, about 1.5 times as hard per point. Rate changes feed in gradually over 12 turns |
| Output gap | Running above trend adds demand pressure, below trend pulls it down |
| Unemployment | Tight labour markets push wages and prices up, slack ones pull them down |
| Commodity prices | Rising costs push inflation up |
| Fiscal stance | Deficit spending adds pressure, surpluses subtract |
| Exchange rate | A weaker currency makes imports more expensive |
| Savings flow | Deposits dampen inflation, withdrawals stimulate it |
| Tariffs and wages | Tariffs above their baseline and wage growth above 2.5% add cost pressure |

The prime rate is set by the chair or committee in [Central Banks](/wiki/central-banks). Commodity prices come from [Commodities](/wiki/commodities), a weaker currency from [Currency Exchange](/wiki/currency-exchange), savings flow from [Savings Interest](/wiki/savings-interest) (where local inflation is subtracted from the prime rate to set the yield), deficit spending from the [National Budget](/wiki/national-budget), and tariffs from [Tariffs](/wiki/tariffs).

Inflation keeps 35% of last turn's value, normally moves at most 1.5 points in a turn, and cannot fall below -2.0%.

Each country has its own inflation target, set per country and era. Most developed economies use 2.0%, but some countries and early eras run much higher (see [Central Banks](/wiki/central-banks)). Inflation far from target hurts all corporate margins, and the central bank chair is judged against the target. Inflation and growth also set the [FOMC](/wiki/fomc) committee's motion and how its NPP seats vote.

So why is inflation rising when you cut rates? Rates below the neutral rate push inflation up, and the full effect of a change takes 12 turns to arrive. A healthy range is growth near the region's own trend, unemployment near its structural rate, and inflation near the country's target.

## State metrics and how they fade

States track many more measures, grouped in ten categories:

| Category | Examples |
| --- | --- |
| Economic | Unemployment, median income, poverty rate, cost of living, small business formation |
| Education | Test performance, literacy, workforce skill, education spending, university enrolment |
| Healthcare | Physician rate, health outcomes, insurance and access |
| Infrastructure | Power grid reliability, road condition, broadband access |
| Public safety | Crime rate |
| Environment | Carbon emissions, renewable energy share |
| Social | Inequality, social mobility, social cohesion |
| Governance | Corruption index, public trust, budget balance |
| Population | Population growth, urbanization, median age, migration |
| Media and information | Press freedom, news trust, disinformation risk |

The exact list varies by country, and a world set in an earlier era leaves out measures that did not exist yet. Each metric has a **value** and a **baseline**. Laws and corporate activity push the value away from the baseline, and **natural decay** pulls it back by 0.25% of the remaining gap each turn.

Who pushes them: enacted laws push state metrics away from baseline every turn ([Bills & Legislation](/wiki/bills-legislation)), and each enacted law keeps pushing its metric while it stays in force. Enacted policy pulls metrics toward a target each turn ([Policy Effects](/wiki/policy-effects)). Ministerial orders and tier settings move metrics ([Cabinet](/wiki/cabinet)), and each cabinet building nudges its region's metrics every turn ([Cabinet Projects & Buildings](/wiki/cabinet-projects)). Public mandates push the matched metrics up each turn, while corruption and transparency set how efficient state companies are ([National Corporations](/wiki/national-corporations)). Spending laws also move state metrics. Effects build over many turns, not one.

Legislators can aim a law at a specific metric: education funding moves literacy and test scores, infrastructure spending moves roads and broadband, environmental rules move emissions.

Take a state whose road condition is 60, so roads add nothing to margins. A funded programme lifts it to 80. If the programme is cancelled, the 20-point gain fades by 0.25% of the remaining gap each turn: about 17.7 points left after 48 turns (one game year), about 10 after 277 turns, and about 2 after 920 turns. Decay is slow on purpose, so sustained policy is what holds a metric away from its baseline.

\`\`\`wiki-chart
metric-decay-recovery
\`\`\`

## Placing sectors where conditions pay

Conditions in a state change the profit margin of corporations operating there, in percentage points. If you run corporations, place sectors where this table works for you, since a state with good roads, a reliable grid and high skill pays you better margins. Growing your sectors also lifts the state's GDP growth and creates jobs.

| State metric | Margin effect | Sectors |
| --- | --- | --- |
| Unemployment | -5 at 0%, 0 at 3%, +5 at 10% and above (tight labour costs more, slack labour is cheaper) | All |
| Power grid reliability | 0 above 95% uptime, down to -4 at 85% | All |
| Corruption index | 0 to -3, scaling to the maximum index | All |
| Road condition | -3 at 0, 0 at 60, +3 at 100 | Manufacturing, retail, agriculture, vehicles, construction |
| Crime rate | 0 at 1,500 per 100,000, -5 at 3,500 and above | Retail, real estate, entertainment |
| Broadband access | 0 at 70% and above, -4 at 40% and below | Technology, telecommunications, media, financial |
| Workforce skill | -4 at 0, 0 at 50, +4 at 100 | Technology, chemical industries, healthcare, manufacturing, defence |
| Carbon emissions | 0 at 3 tons per person, -3 at 25 and above | Energy, manufacturing, vehicles |

With roads at 80 against the 60 where they add nothing, manufacturing, retail, agriculture, vehicle and construction corporations there gain (80 - 60) / 40 x 3 = **+1.5 margin points**.

## Who reads the numbers

- Governors and presidents: every state metric is compared with the national average to score [Government Approval](/wiki/government-approval).
- Elections: unemployment, poverty, inflation and income set National Mood ([Election Mechanics](/wiki/election-mechanics)). In one-party regimes, economy and conditions feed Popular Legitimacy ([One-Party States](/wiki/one-party-states)). In the UK, inflation above 5% raises independence desire and below 2% lowers it ([Independence and Reunification Referendums](/wiki/referendums)).
- Bonds: debt-to-GDP sets the credit rating and borrowing cost ([Sovereign Bonds](/wiki/sovereign-bonds)).
- Command economies: shortage, overhang and the black market feed the marketization dial ([Planned / Command Economies](/wiki/planned-economies)).
- Currency: inflation, growth and trade drift the exchange rate, and the household price index sets real purchasing power in the economy panel.

Live in every world, for every country. Which state metrics exist and what the inflation target is depend on the country and the era the world starts in. Last checked 2026-10-29, version 1.18.0. Exact rules: [National Metrics (design)](https://docs.lakesidegames.net/design/national-metrics.html). See also: [Glossary](/wiki/glossary), [Demographics](/wiki/demographics)
`;
