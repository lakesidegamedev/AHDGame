export const policyEffectsContent = `# Policy Effects

Pass a law today and the numbers will only start to move tomorrow. A policy does not move a metric instantly: it moves the metric's target, and the metric closes the gap a little every turn. A strong law starts working at once but takes a few days of real time to show most of its effect, so plan for the election after next, not the next one.

## What a signed law does each turn

In the US, the UK, Russia and East Germany every program law has a level from 0 (fully repealed) to 4. An enacted [bill](/wiki/bills-legislation) that changes a law's level is what starts a policy moving a metric. Each turn (one real hour) the game rebuilds every region's targets from the current levels and moves each metric one step toward its target.

1. **Points from the law book.** A law aimed at one metric adds 12.5 points to that metric's target per level, so a full swing from level 0 to level 4 is worth 50 points. A broader law touches two to five metrics, at 5 points per level times a weight between 0.25 and 0.6 for each. National laws apply in full to every region. A regional law adds half its points, and only in its own region.
2. **The region's own starting point.** Each region keeps the part of its score that its laws do not explain, so a region that starts above or below the law book stays above or below it.
3. **Bends from the rest of the game.** The state of the economy, the services the government actually funds, cabinet work, strikes and living conflicts each bend the target up or down a little.
4. **One step toward the target.** The metric closes 2% of the remaining gap every turn, and always at least 0.01 points, so a small gap does close instead of crawling forever.

The target is kept between 0 and 100. Policy moves scores like public safety, health and education each turn, starting from the values held in [National Metrics](/wiki/national-metrics).

![Per-turn pipeline from active laws to a weighted target, pull toward the target, direct push, drift to baseline and clamp.](/wiki-images/diagrams/policy-effects-turn-pipeline.svg)

Slow movement keeps one bill from rewriting the country overnight, and it gives opponents time to answer. A law that is repealed takes its points off the target, so its effect fades out rather than snapping back.

## How long until it shows

| Item | Value |
| --- | --- |
| Gap closed per turn | 2%, and at least 0.01 points |
| Half-life of the gap | About 34 turns, about 0.7 game years, about 1.4 real days |
| Turn length | 1 real hour; 48 turns = 1 game year = 2 real days |
| Target shift per level, one-metric law | 12.5 points (50 points from level 0 to level 4) |
| Target shift per level, broader law | 5 points times the weight (0.25 to 0.6) on each metric |
| Regional law | Half strength, own region only |
| Population shift from a max-strength law | Up to 0.1% of a group per turn |

The one formula that matters: \`new value = current + (target - current) x 0.02\`.

Take a one-metric law raised by one level, so its target moves by **12.5 points**. The metric gets there like this:

| Turns since enactment | Real time | Share of the gap closed | Metric has moved |
| --- | --- | --- | --- |
| 24 | 1 day | 38% | 4.8 |
| 48 | 2 days | 62% | 7.76 |
| 96 | 4 days | 86% | 10.7 |
| 210 | about 9 days | 100% | 12.5 |

Expect the first visible move within the first few turns, and most of the effect within about four days of real time. Pass the law early if you want to see it before the next election, and remember a regional law is half as strong in its own region as the same law passed nationally.

### Countries without a law book

Laws in other countries work on the older option ladder. When such a bill is enacted, a law aimed at a metric gives that metric a one-off shift of 0.5 in the chosen direction, and on the political scores that shift moves the equilibrium for good rather than fading.

Regions of a country with no political board at all (today only an independent Scotland or Wales) still run the oldest model: the metric closes about 0.72% of the gap to its policy target each turn (time constant 139 turns, half-life about 96 turns or 2 game years), the strongest option on a weight 1 law moves the target by 12 points, some options add a small flat push of up to about 0.06 per turn, and a metric slowly returns toward its baseline when no law pushes it.

\`\`\`wiki-chart
policy-effect-over-time
\`\`\`

In that older model some effects also fade as the economy adjusts. A target with an adaptation half-life keeps only \`0.5^(turns / half-life)\` of its effect. With a half-life of 24 turns, 25% remains after 48 turns; with 48, 50% remains; with 96, about 71% remains.

\`\`\`wiki-chart
policy-adaptation-decay
\`\`\`

## Reading and changing the current laws

- **Check before you vote.** Each provision on a bill shows where its option sits on the two axes (economic left to right, social progressive to conservative).
- **Read the current picture.** The **National Policy** page lists all national policies by domain with the current option. The **Laws & Policy** tab on a state page shows the state's own laws. Your character profile shows your personal positions, which are separate from enacted law.
- **Stack different laws.** Laws on different legislation types that target the same metric add together.
- **Replace a law.** Enacting a bill on the same legislation type in the same place overwrites the old record, and the metric starts moving toward the new target. Two opposing bills on the same type do not cancel: the last one enacted wins. Subsidies, embargoes and union bans have explicit repeal provisions (see [Bills & Legislation](/wiki/bills-legislation)).
- **Be patient.** Policy is a slow lever.

![National Policy page listing statutes grouped by domain with their enacted dates](/wiki-images/screens/policy-effects-national-policy.webp)

Two policy scales are in play, and they are not the same thing:

| Level | Scale | What it drives |
| --- | --- | --- |
| Character positions | -5 to +5 | Electoral appeal to demographic groups |
| Enacted law | Level 0 to 4, or a graded ladder of options | Per-turn metric effects on states and nation |

Voting on a bill can also nudge your own positions (see [Voting & Whips](/wiki/voting-and-whips)).

## Effects on people

Active laws also shift the make-up of demographic groups (see [Demographics](/wiki/demographics)): up to 0.1% of a group's population per turn at full strength, and group leanings by up to 0.035 per turn, with a cap of 1.5 total from the seeded baseline. This builds over game years. Changing conditions in turn feed how people judge the government (see [Government Approval](/wiki/government-approval)).

## Why a metric did not move

- The bill was not enacted yet, or it was signed but the first turns have only started to close the gap.
- The law has no weight on that metric.
- Another law pulls it the other way, or the economy, funded services or unrest bend the target back.
- The law was passed regionally, so it counts at half strength and only in that region.
- The metric is a computed budget figure. Those follow the budget, not policy (see [National Budget](/wiki/national-budget)).
- The law does not exist yet in the current era.

Live in every world. The US, the UK, Russia and East Germany use the law book described above; other countries use the older option ladder. Which laws exist depends on the era, so a law cannot be passed before its time.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Policy system design page](https://docs.lakesidegames.net/design/policy-system.html)
`;
