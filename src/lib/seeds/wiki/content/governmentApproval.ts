export const governmentApprovalContent = `# Government Approval

Leave half your cabinet empty and you start every turn 3.75 points in the hole; leave all of it empty and it is 7.5. Drag the country into a long war and the public wears down at a point a year. Government approval is the share of a country's people who support the government, from 0 to 100, scored from how the country is actually doing rather than how popular any one politician is. It matters because it scales the votes parties win in every election.

Open a country's Approval page to see approval, disapproval and net approval, the last 20 turns of history, and every active modifier with its value. A net approval above +10 is comfortable. Below 0 is a warning. Approval and disapproval always add to 100: there is no undecided group, and net approval is approval minus disapproval.

![Country Approval page showing national approval, the state average and the regional conditions list](/wiki-images/screens/government-approval-country-approval.webp)

## From state metrics to a national number

Each turn the game does this for every country:

1. **Compare each state metric with the national average.** Every state is scored on its metrics across 10 categories (economic, education, healthcare, infrastructure, public safety, environment, social, governance, population, and media and information), all supplied by [National Metrics](/wiki/national-metrics). For each metric the game knows whether higher or lower is better. A metric that beats the national average adds points, and one that trails it subtracts them. Each metric can add or subtract at most 2 points, and a metric needs to be about 13% better or worse than average to hit that cap. A metric 10% better than average adds 1.5.
2. **Turn the metrics into a state score.** Metrics that matter more to a state's voters (based on their economic and social leanings, see [Demographics](/wiki/demographics)) count for more, so the same national picture can score differently in a progressive and a conservative state.
3. **Add named conditions.** Set patterns of metrics, such as Economic Boom or Recession, add or subtract points.
4. **Step toward the result.** A state's stored rating moves toward its new score by at most 2 points a turn.
5. **Average the states by population.** This gives the national figure.
6. **Apply national modifiers.** Cabinet gaps, war, public expectations and a few other effects are added to the national figure. These land at once and are not smoothed.

\`\`\`wiki-chart
approval-metric-contribution
\`\`\`

![Pipeline from state metrics through state score, conditions and smoothing to a national figure, national modifiers, the stored rating and elections.](/wiki-images/diagrams/government-approval-pipeline.svg)

The one formula worth knowing:

**State score = 50 + (weighted average metric contribution x 2.5)**

Because each contribution is capped at 2, metrics alone move a state at most 5 points either side of its starting point of 50. Named conditions and national modifiers do the rest. In the US, the UK, Russia, East Germany and the non-playable countries that carry a derived political board, the state base comes from that political board instead of this metric comparison, so the base shown on the Approval page may not be exactly 50. Named conditions, smoothing and national modifiers still apply on top.

| Item | Value |
| --- | --- |
| Starting score | 50 |
| Cap on one metric's contribution | +2 or -2 |
| Metric gap that hits the cap | about 13% from the national average |
| Multiplier on the average contribution | 2.5 |
| Smoothing of a state's stored rating | 2 points per turn |
| Named conditions | 82, each worth -3 to +2 |
| Cap on all positive modifiers together | +8 (negatives have no cap) |
| Empty cabinet | up to -7.5, scaled by the share of seats empty |
| Acting appointment | -0.5 each |
| Public expectations | 0 on taking office, building to -5 over the head of government's term |
| Union crackdown | -2 while unions are banned and a crackdown is under way |
| History kept | last 20 turns |

A state's metrics average a contribution of +1.2, so its score is 50 + 1.2 x 2.5 = 53.0. Economic Boom adds 2, so the target is **55.0**. Its stored rating was 48.0. It steps 2 points a turn: 50.0, 52.0, 54.0, then 55.0 on the fourth turn. The national figure is the population-weighted average of all states. Say it comes to 55.0. The head of government is halfway through a four-year term (-2.5 expectations) and 2 of 10 cabinet seats are empty (-1.5). The national approval is 55.0 - 2.5 - 1.5 = **51.0**. Filling the seats raises it to 52.5 the same turn.

### Named conditions

Each condition needs all of its metric tests to be true. Effects stack. Here are six examples with their default triggers (the triggers shift by country and era, and the Approval page lists the live ones):

| Condition | Effect | Default trigger |
| --- | --- | --- |
| Economic Boom | +2 | GDP growth at least 3.0% and unemployment at most 4.5% |
| Healthcare Excellence | +2 | Life expectancy at least 83 and affordability at least 78 |
| Free Press | +1 | Press freedom at least 79 |
| Recession | -3 | GDP growth at most 0% and unemployment at least 7% |
| High Corruption | -3 | Corruption index at least 58 and public trust at most 35 |
| Fiscal Crisis | -2 | Budget balance at or below -5.0% of GDP |

The other 76 cover economy, health, safety, environment, government, society, infrastructure, media and population. Most are worth 1 point either way. Fiscal Crisis is where the [National Budget](/wiki/national-budget) bites: higher debt bands also cut public trust, and a deficit worse than 5% of GDP can trigger it. Conditions moved by policy feed how people judge the government (see [Policy Effects](/wiki/policy-effects)).

## The national modifiers

These are listed beside the rating on the Approval page, so the number always has a reason attached.

\`\`\`wiki-chart
cabinet-approval-drag
\`\`\`

\`\`\`wiki-chart
war-exhaustion-curve
\`\`\`

| Modifier | What it is |
| --- | --- |
| National address | A speech by the head of government gives a temporary bump |
| International statements | A joint statement by an international organization about your country, limited in size and time |
| War effort | How the front is moving against what the war was expected to achieve (-2 to +2) |
| War exhaustion | Public support for fighting, starting at +1 and turning to cost |
| War defeat | -5 after losing a war, fading to nothing over 3 game years, never more than -10 together |
| Alliance contribution | For a treaty ally, what you field against your allies (-1 to +1) |
| Higher public expectations | A new head of government starts at 0 and builds to -5 across their term |
| Empty cabinet seats | -7.5 with no seat filled, less in proportion as seats fill |
| Acting appointments | -0.5 for each acting secretary, shown together on one line |
| Union crackdown | -2 while unions are banned and a crackdown is under way |
| Bank failures | A recent bank failure costs approval for a while (worlds with private banking only) |

Joint statements by [International Organizations](/wiki/international-organizations) add or subtract points while they last, a union ban with a crackdown costs 2 points ([Unions](/wiki/unions)), and an unpopular taking costs approval and legitimacy ([Nationalization](/wiki/nationalization)). A map over its fairness ceiling lowers that state's approval by 2 to 5 points ([US House Redistricting & Gerrymandering](/wiki/us-house-redistricting)). Legislators who voted For an enacted bill see approval shift among population groups ([Bills & Legislation](/wiki/bills-legislation)).

### The cabinet bill

A cabinet with 2 of 10 seats empty loses 1.5 points. The acting penalty only exists in presidential countries where cabinet picks need confirmation, since parliamentary and one-party governments fill posts directly. An acting secretary still holds the seat, so they do not count as empty. Five acting secretaries cost 2.5 points. Seat rules are in [Cabinet](/wiki/cabinet).

Expectations build in a straight line. Halfway through a four-year term the drag is -2.5.

### Fighting a war

War arrives as separate lines, because a war going well and a tired public are different facts that call for different answers.

- **War effort** judges the front against what the war was expected to do, not just who holds ground. A defence that gives up nothing is a success. An invasion that stalls is a failure. Putting down a rebellion is credited as winning. How the front moves, and how long a war lasts, change approval ([Conflicts & the Military System](/wiki/conflicts-overview)), and territory won or lost changes approval at home ([Occupation, Territory & Victory](/wiki/occupation-and-victory)). Losses at sea cut war approval once fleet condition is under 70 ([Blockades](/wiki/blockades)).
- **War exhaustion** is measured from the turn your own country entered. Entering a war from peace rallies the public by +1 on top of any exhaustion still carried, capped at +1 ([Declaring War](/wiki/declaring-war)); a country still carrying -3 opens at -2. Support then falls by 1 point per game year (48 turns), turning to cost after about a year, down to a floor of -25. Exhaustion carries over a peace and heals at the same pace it built, 1 point per game year. A country that never stops fighting never gets the rally. A year of fighting takes a year of peace to forgive. Ending a war removes the war effort and alliance lines at once, while exhaustion keeps healing ([Peace, Indemnities & Truces](/wiki/peace-and-truces)).
- **Alliance contribution** applies to a country pulled in by a mutual-defence treaty. Matching your allies is neutral, sending nothing costs approval, and carrying more than your share earns it. Nobody is penalized in the first 6 turns after entry.

When a war ends, the effort and alliance lines vanish that turn; exhaustion heals at a point a year and a defeat penalty fades over three years. See [A War, Start to Finish](/wiki/a-war-start-to-finish).

Active crises can add direct approval effects each turn, on top of the metric score. A major crisis can swing approval by several points a turn. See [Crisis Interaction](/wiki/crisis-interaction). Favorability changes from [Player Random Events](/wiki/player-events) feed public standing, and most responses to [World Events](/wiki/world-events) move approval up or down.

## What the head of government can do

Rank your levers by size:

1. Fill the cabinet. It is worth up to 7.5 points and lands at once.
2. Avoid acting appointments where confirmation is available. Each costs 0.5.
3. Treat a war as an approval decision. A fresh war rallies the public once, a long one wears it down, and exhaustion follows you into the next war.
4. Watch the named conditions. Metrics are scored against the national average, so lifting every state together barely moves the metric part; nationwide booms and slumps reach approval through conditions such as Economic Boom, Recession and High Unemployment.
5. Close the gap in lagging states. A state that trails the national average on many metrics drags its own score, and populous states weigh most in the national figure.

As opposition, track the named conditions. Rising unemployment that trips High Unemployment or Recession pulls approval down within a few turns, and the election multiplier makes that matter at the ballot box. Inflation has no direct approval term.

If approval is under 40, expect recovery to take time. State ratings move at most 2 points a turn, so a 10 point gap needs at least 5 turns even if every metric turns around at once. National modifiers such as the cabinet penalty are the fast fixes. If approval dropped this turn, check the modifier lines first: a war line, an empty seat or a new Recession condition shows up there.

## What approval does to the vote

Each state's approval scales the vote pool in every election there:

- **Presidential elections:** the vote pool is multiplied by 1 + (approval - 0.5) x 0.5, up to 25% either way. At 70% approval that is 1.10. At 30% it is 0.90.
- **Legislative and other elections:** the multiplier is 1 + (approval - 0.5) x 0.2, up to 10% either way. At 70% approval that is 1.04. At 30% it is 0.96.

\`\`\`wiki-chart
approval-vote-pool-multiplier
\`\`\`

This applies in [General Elections](/wiki/general-elections) races, and [Election Mechanics](/wiki/election-mechanics) scales the pool for the governing party. Regional approval also pushes independence and reunification desire toward the First Minister's stance. Low Westminster approval raises separation desire and high Westminster approval lowers it, independently of Westminster's stance ([Independence and Reunification Referendums](/wiki/referendums)).

Low approval does not trigger a snap election and does not remove the head of government. In the UK, approval below 50 does make NPP ministers more likely to resign and erodes the government's confidence gauge. Snap elections in parliamentary countries (UK, Japan, Germany) come from only two things: the Prime Minister (or Chancellor in Germany) choosing to dissolve the lower chamber, or no Prime Minister being appointed within 96 turns of the government entering pending status. See [Snap Elections](/wiki/snap-elections).

Live in every world for every country. A world set in an earlier era ignores metrics that did not exist yet. The acting appointment penalty applies only in presidential countries with confirmation. War lines appear only for countries at war, or still carrying exhaustion from one. The union crackdown line appears only where unions are banned. Bank failure lines appear only in worlds with private banking. Last checked 2026-10-29, version 1.18.0. Exact rules: [Government Approval (design)](https://docs.lakesidegames.net/design/government-approval.html). See also: [Glossary](/wiki/glossary)
`;
