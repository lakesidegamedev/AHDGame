export const policyEffectsContent = `# Policy Effects

Every signed bill changes the law, and the law slowly pulls the country's numbers. A policy does not move a metric instantly: it moves the metric's target, and the metric closes the gap a little every turn. A strong law starts working at once but takes days of real time to show most of its effect.

## How it works

Each turn (one real hour) the game recalculates every active law and applies three layers in order.

1. **Pull toward a target.** Each legislation type lists the metrics it affects and a weight for each. The active options set a target for the metric. The metric closes about 0.72% of the remaining gap every turn.
2. **A small direct push.** Some policy options also add a flat change to a metric each turn. Extreme options push about 0.06 per turn before the federal share is taken; moderate ones push less; the center option pushes nothing.
3. **Drift back to normal.** A metric that no policy is pushing slowly returns to its historical baseline at 0.25% of the distance per turn, so the world does not freeze at whatever the last extreme law left behind.

The metric is then kept inside its allowed range.

### Key numbers

| Item | Value |
| --- | --- |
| Gap closed per turn | 0.72% (time constant 139 turns) |
| Half-life of the gap | About 96 turns, 2 game years, 4 real days |
| Turn length | 1 real hour; 48 turns = 1 game year = 2 real days |
| Largest target shift from one law on one metric (weight 1) | 12 points for a state law; 2.52 points for a national law |
| Natural drift back to baseline | 0.25% of the distance per turn |
| Direct push (extreme option) | About 0.06 per turn, times the federal share |
| Federal share of the direct push | US 1/50, UK 1/12, Japan 1/8, Germany 1/16 per region |
| Population shift from a max-strength law | Up to 0.1% of a group per turn |

The one formula that matters: \`new value = current + (target - current) x 1/139\`.

### Worked example

A national law with a weight of 1.0 on a metric and the strongest option on the ladder moves the target by 12 x 0.21 = **2.52 points**. Starting at the baseline, the metric gets there like this:

| Turns since enactment | Real time | Share of the gap closed | Metric has moved |
| --- | --- | --- | --- |
| 48 | 2 days | 29% | 0.74 |
| 96 | 4 days | 50% | 1.26 |
| 480 | 20 days | 97% | 2.44 |

A state law with the same weight and option moves its own target by 12 points, so after 48 turns that state has moved 3.5 points. National laws are scaled down so that a strong national law moves a country-wide metric by the same amount whether the country has 12 regions or 50.

### Why it works this way

Slow movement keeps one bill from rewriting the country overnight, and it gives opponents time to answer. The drift back to baseline means a policy has to be maintained to keep its effect, and a law that is repealed fades out rather than snapping back.

### Adaptation

Some effects fade as the economy adjusts. A target with an adaptation half-life keeps only \`0.5^(turns / half-life)\` of its effect. With a half-life of 24 turns, 25% remains after 48 turns; with 48, 50% remains; with 96, about 71% remains. For example, a defense cut may hit output hard at first and less as the economy adapts.

## What you can do

- **Check before you vote.** The bill composer shows the options on the two axes (economic left to right, social progressive to conservative).
- **Read the current picture.** The **National Policy** page lists all federal policies by domain with the current option. The **State Laws & Policy** tab on a state page shows the state's own laws. Your character profile shows your personal positions, which are separate from enacted law.
- **Stack different laws.** Laws on different legislation types that target the same metric add together.
- **Replace a law.** Enacting a bill on the same legislation type in the same place overwrites the old record, and the metric starts moving toward the new target. Two opposing bills on the same type do not cancel: the last one enacted wins. Subsidies, embargoes and union bans have explicit repeal provisions (see [Bills & Legislation](/wiki/bills-legislation)).
- **Be patient.** Expect the first visible move within a day or two of real time, and most of the effect within about ten days for a strong law.

Tips: pass the law early if you want to see it before the next election; remember a state law is stronger on its own state than a national law is on any one region.

### Two policy scales

| Level | Scale | What it drives |
| --- | --- | --- |
| Character positions | -5 to +5 | Electoral appeal to demographic groups |
| Enacted law | Graded ladder of options, centre to extreme | Per-turn metric effects on states and nation |

Voting on a bill can also nudge your own positions (see [Voting & Whips](/wiki/voting-and-whips)).

### Slower effects on people

Active laws also shift the make-up of demographic groups: up to 0.1% of a group's population per turn at full strength, and group leanings by up to 0.035 per turn, with a cap of 1.5 total from the seeded baseline. This builds over game years.

## Why a metric did not move

- The bill was not enacted yet, or it was signed but the first turns have barely closed the gap.
- The legislation type has no weight on that metric.
- Another law on a different type pulls it the other way.
- The metric is a computed budget figure. Those follow the budget, not policy (see [National Budget](/wiki/national-budget)).
- The metric does not exist yet in the current era.

## Connections

**Driven by**

- [Bills & Legislation](/wiki/bills-legislation): an enacted bill is what starts a policy moving a metric.
- [National Metrics](/wiki/national-metrics): the starting values and baselines the policy pulls against.

**Affects**

- [National Metrics](/wiki/national-metrics): policy moves metrics like crime, health, education and income each turn.
- [Demographics](/wiki/demographics): active laws slowly shift group make-up and leanings.
- [Government Approval](/wiki/government-approval): changing conditions feed how people judge the government.

## Status

Live in every world. The federal share depends on the country: the US, UK, Japan and Germany each split a national law across their own regions. Which metrics exist depends on the era, so a law cannot move a metric that does not exist yet.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Policy system design page](https://docs.lakesidegames.net/design/policy-system.html).
`;
