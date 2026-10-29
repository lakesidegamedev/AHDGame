export const cabinetProjectsContent = `# Cabinet Projects & Buildings

If you hold a cabinet seat you can build things: schools, hospitals, embassies, power plants, highways. Each building is a lasting asset that gives its region a small nudge to its metrics every turn, and its running cost is weighed against your ministry's budget. Build where the problem is and stay near your budget envelope.

## How it works

Buildings belong to the seat, not to you personally, and each sits in one region for good. There are three kinds, depending on which seat you hold.

| System | Who gets it | Assets |
| --- | --- | --- |
| **Estates** | Most portfolio seats in the US, UK, Germany, China, Japan, Ireland and the command-economy states | Schools, hospitals, courts, embassies and more (three archetypes or more per portfolio) |
| **Energy plants** | The energy seat (US: Secretary of Energy; UK: Environment Secretary) | Coal, gas, nuclear, hydro, wind, solar |
| **Infrastructure projects** | The transport seat | Highways, transit, bridges, railways, broadband, freight, airports |

Upkeep is modeled pressure on the national budget balance metric, not an actual withdrawal from the federal budget. The total upkeep of what you built is compared with your **discretionary envelope**. Under the envelope gives a small positive tilt to the budget balance each turn; over it, a negative tilt that grows with the overshoot (at most 0.05 per turn at full scale).

### Key numbers

| Item | Value |
| --- | --- |
| Ministerial actions | Cap 4, regain 1 every 6 turns |
| Open, Expand, build a plant, upgrade a plant, start a project | 1 ministerial action each |
| Close, Fund, change project funding, cancel | Free |
| Estate tiers (upkeep multiplier) | Basic 1.0, Established 1.5, Expanded 2.0, Flagship 2.5 |
| Estate funding (upkeep, output, settled condition) | Reduced 0.6 / 0.7 / 55; Standard 1.0 / 1.0 / 75; Enhanced 1.5 / 1.25 / 90 |
| Estate envelope | 4% of the department appropriation, held between 3,500 and 5,000 (millions per turn) |
| Transport envelope | 1.2% of the transport appropriation, held between 3,000 and 5,000 |
| Plant tiers (capacity multiplier) | Standard 1.0, Expanded 1.5, Major 2.0, Mega 2.5 |
| Project funding (speed, cost) | Slowed 0.5x / 0.6x; Standard 1.0x / 1.0x; Crashed 1.8x / 1.6x |

Upkeep numbers are in millions per turn.

## Estates

An **estate** is a facility tied to your portfolio. Every estate has four things:

- **Location**: chosen when you open it, then fixed. Domestic estates sit in one region and affect that region. Foreign-portfolio estates, such as embassies, sit in another country and raise your own country's soft-power metrics, not the host's.
- **Tier**: the **Expand** lever. Higher tiers give stronger effects and higher upkeep.
- **Funding**: the **Fund** lever, free to change. Higher funding raises upkeep and output and the condition the estate settles at.
- **Condition** (0 to 100): drifts toward the baseline of your funding level (55, 75 or 90). Effects scale with condition, so a neglected estate does proportionally less. Upkeep does **not** scale with condition: a run-down hospital still costs money.

Each estate's effect is small and scales with tier, funding and condition. All cabinet effects on one metric are capped per turn, so stacking has diminishing returns.

### Worked example: a school

A Public School has base upkeep of 60 and nudges high school graduation by 0.02 and test performance by 0.015 per turn in its region. At Basic tier and Standard funding it costs 60 per turn. A Flagship school at Enhanced funding costs 60 x 2.5 x 1.5 = 225 per turn but delivers a stronger effect once its condition has climbed to 90. Condition moves slowly, so after switching from Standard to Enhanced it takes several turns before the extra output shows. With an envelope of 3,500 to 5,000, ten Basic schools (600 per turn) are comfortably under it.

## Energy plants

Your plants in a region form that region's generation mix, which nudges three regional metrics toward what the mix implies: renewable share, carbon emissions, and power grid reliability. The nudge is small when the metric is already near its target and saturates at 0.08 per turn when it is far.

Reliability scores 70% on how much of your capacity is firm (always-on) and 30% on diversity, with four or more distinct sources earning full credit.

| Source | Default capacity (MW) | Upkeep per MW | Upkeep at default | Carbon per MW | Firm |
| --- | --- | --- | --- | --- | --- |
| Coal | 800 | 0.08 | 64 | 1.0 | 1.0 |
| Gas | 600 | 0.05 | 30 | 0.5 | 1.0 |
| Nuclear | 1,200 | 0.12 | 144 | 0 | 1.0 |
| Hydro | 500 | 0.03 | 15 | 0 | 0.9 |
| Wind | 300 | 0.04 | 12 | 0 | 0.3 |
| Solar | 250 | 0.03 | 7.5 | 0 | 0.25 |

A plant can be upgraded through four tiers, each raising capacity and upkeep by the tier multiplier, and can be decommissioned. For example, an Expanded coal plant has 800 x 1.5 = 1,200 MW and costs 96 per turn. A big nuclear build in a coal region shows visible movement for many turns and then settles.

## Infrastructure projects

Projects take several turns to build and then give fixed standing effects.

| Project | Build time (turns) | Construction spend per turn | Upkeep per turn | What it does |
| --- | --- | --- | --- | --- |
| Highway | 6 | 120 | 40 | Road condition up, investment gap down |
| Transit | 8 | 180 | 60 | Public transit up, investment gap down |
| Bridge | 4 | 80 | 25 | Road condition up |
| Railway | 9 | 190 | 55 | Transport efficiency up, investment gap down |
| Broadband | 5 | 90 | 30 | Broadband access up |
| Freight | 7 | 150 | 50 | Road condition up, GDP growth up |
| Airport | 7 | 200 | 70 | Public transit up, GDP growth up |

While a project is under construction you set its funding level. A highway takes 12 turns at Slowed funding and spends 72 per turn, 6 turns at Standard and spends 120, and about 4 turns at Crashed and spends 192. Once operational it is permanent and pays only upkeep. Unlike plants, infrastructure effects are flat bonuses that do not fade as the region improves.

## What you can do

- Open or expand an estate, and change its funding for free.
- Build or upgrade a plant, or decommission it.
- Start an infrastructure project, change its funding, or cancel it.
- Read your total upkeep against your envelope on the seat's build panel before you commit.

Tips:

- Put buildings where the problem is. A school only helps the region it sits in.
- Condition lags funding, so Enhanced funding is a long-term commitment.
- Actions are scarce (max 4), and builds compete with ministerial orders for the same actions.
- Location is forever. To move something, close or decommission it and rebuild.

### Common questions

- **Why did my school stop helping?** Its condition probably fell because funding is Reduced, or another law is pulling the same metric the other way.
- **What happens when I leave office?** The assets are stored against the seat, not against you, and stay in place for whoever holds it next.

## Connections

**Driven by**

- [Cabinet](/wiki/cabinet): you need a confirmed or acting seat, and the actions it gives, to build.
- [National Budget](/wiki/national-budget): the department appropriation sets the size of the discretionary envelope.

**Affects**

- [National Metrics](/wiki/national-metrics): each building nudges its region's metrics every turn.
- [National Budget](/wiki/national-budget): total upkeep above or below the envelope tilts the budget balance metric.

## Status

Live for every country whose cabinet has an authored portfolio. Estates are available in the US, UK, Germany, China, Japan, Ireland and the command-economy states (Soviet Union and East Germany). Energy plants and infrastructure projects depend on which seat the country maps to energy and transport. Which seats exist in a given year depends on the era.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Cabinet design page](https://docs.lakesidegames.net/design/cabinet.html).
`;
