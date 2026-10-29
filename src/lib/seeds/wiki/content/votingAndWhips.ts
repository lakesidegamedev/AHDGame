export const votingAndWhipsContent = `# Voting & whips

Every legislator, player or non-player politician (NPP), can vote on every bill in their chamber. Your own vote is a free choice. A whip is a party directive that tells members how to vote, and it is the main tool for moving NPP votes your way.

## How it works

1. A bill opens in a chamber and stays open for 24 hours. Members of that chamber vote For, Against or Abstain. Only your latest vote counts and you can change it until the window closes.
2. Players choose for themselves. NPPs vote automatically, using four forces that push them For (positive) or Against (negative).
3. Party leaders can issue a whip on the bill. A hard whip rolls once for each NPP; a soft whip only adds pressure to the NPP's own decision.
4. The chamber tallies For and Against. Abstentions are neutral. For must exceed Against for a simple-majority bill. There is no minimum turnout: a bill can pass on one For vote if nobody votes Against.

![Four clamped forces sum into For, Against or Abstain for an NPP bloc, and a successful hard whip roll writes the vote directly.](/wiki-images/diagrams/voting-and-whips-four-forces.svg)

### Key numbers

| Item | Value |
| --- | --- |
| Voting window | 24 hours |
| Position shift per vote | Up to 0.25 per axis, once per bill |
| Each force | Clamped to -100 to +100 |
| NPP verdict | Sum above +5 is For, below -5 is Against, otherwise Abstain |
| Hard whip base chance | 55%, plus mode bonus 15, loyalty and Statecraft bonuses, minus stubbornness |
| Soft whip roll bonus | 6 (used only for leadership, nomination and confidence votes) |
| Whip success chance limits | 40% to 95% |
| Whip pressure on NPP decision | Party hard 60, party soft 30, caucus 40, caucus core-position bonus 20, then scaled by the NPP's compliance |
| Party-line lean (same party as sponsor, no whip) | 20, scaled by compliance |

\`\`\`wiki-chart
whip-success-by-loyalty
\`\`\`

### The four forces

| Force | What it measures |
| --- | --- |
| **Ideology** | How well the bill's direction matches the NPP's own stance on that issue. |
| **Whip** | Party and caucus whips, scaled by the NPP's loyalty and stubbornness. |
| **District** | How the NPP's home-state population feels about the selected policy option. |
| **Donors** | The NPP's donor base (level 0 to 5) times the same policy alignment as ideology. |

The compliance scale is loyalty x 0.7 plus (1 minus stubbornness) x 0.3, so a fully loyal, unstubborn NPP feels the whole whip and a stubborn, disloyal one feels little of it. Only a near tie produces an abstention, so most NPPs vote decisively.

### Worked example

A 100 seat chamber. A bloc of 7 NPP seats has forces ideology +20, whip +30, district -10 and donors +5. The sum is +45, so the bloc votes For and adds 7 to the For count (a bloc counts its full seats). A second bloc has ideology -40, whip +30 (party hard whip), district -15, donors 0: sum -25, so it votes Against despite the whip. A third has +3, -4, +1, 0: sum 0, so it abstains.

For hard whip rolls: an NPP with loyalty 80 and stubbornness 40 scores 55 + round(80 x 0.35) - round(40 x 0.18) + 15 = 55 + 28 - 7 + 15 = 91%. Under a soft whip the roll does not decide the vote, so the same NPP just feels a 30-point pull scaled by compliance 0.8 x 0.7 plus 0.6 x 0.3 = 0.74.

### Why the model works this way

Votes are a sum of forces, not a dice roll, so you can read a chamber in advance and a whip matters most when the other forces are close. A whip that fights ideology, district and donors together will usually lose.

## What you can do

- **Vote** from the bill's detail page while the bill is open in your chamber. Changing your vote is free.
- **Whip** if you are your party's Chair or Vice Chair, or hold chamber leadership such as Speaker, majority or minority leader, or whip. State and regional party leaders whip NPPs in their own geography, and caucus leaders whip their own members. Leaders are elected as described on [Congress Leadership](/wiki/congress-leadership) and [Chamber Leadership](/wiki/chamber-leadership); floor whips are appointed, not elected.
- **Pick hard or soft.** A hard whip writes the vote immediately when the roll succeeds. A soft whip leaves the NPP deciding with extra pressure.
- **Read the defiance watch** to see which members currently vote against your whip. It shows only live defiance and clears when the member comes back into line.

![Bill vote panel with For, Against and Abstain buttons, the vote by party table and the whip count](/wiki-images/screens/voting-and-whips-vote-panel.webp)

**Your vote moves your own positions.** An Aye pulls you toward the bill's average position on each axis by up to 0.25, never past it. A Nay pushes you 0.25 away. The buttons show the exact move first. Flipping votes does not stack, and switching to Abstain reverts the shift. A vote written onto you by a party whip never moves you and is not counted as your own. Bills with no ideology, such as a war declaration or a tariff-only bill, move nobody.

**Whips and players.** A whip never takes away a player's choice. A hard whip can write a vote for you, but you can change it. There is no automatic penalty for defying your party's whip: no infamy, no stat loss. The cost is political, through the trust of your leadership and your standing in your party.

**Leadership and confidence votes.** For votes on leadership elections, cabinet and Supreme Court nominations, prime minister appointment and confidence motions, a hard whip is binding on same-party NPPs. Under a soft whip they use the loyalty and stubbornness roll.

Tips: abstaining on a bill you cannot stop keeps your record clean; give swing-seat NPPs a soft whip rather than a hard one if a forced vote could cost them next election.

### Viewing votes

Each bill page shows live For, Against and Abstain totals for each chamber and your own vote.

## Connections

**Driven by**

- [Congress Leadership](/wiki/congress-leadership): holding Speaker, floor leader or whip roles gives you the power to issue whips.
- [Chamber Leadership](/wiki/chamber-leadership): the same roles in other countries' chambers decide who can whip.
- [NPPs Overview](/wiki/npps-overview): NPP loyalty, stubbornness, donors and home state feed the forces.
- [Cloture & Filibuster](/wiki/cloture-and-filibuster): a filibuster changes how many For votes a Senate bill needs.
- [party-leadership](/wiki/party-leadership): Party Leadership: chair, vice chair and chamber leaders hold the seats that can issue the whips this page describes.
- [npp-autonomy](/wiki/npp-autonomy): NPP Autonomy: at level 6, NPP-led governments whip their own members on bills that serve their goals.

**Affects**

- [Cloture & Filibuster](/wiki/cloture-and-filibuster): the For, Against and Abstain counts are what the 60 percent bar is tested against.
- [Supreme Court](/wiki/scotus): whips shape senators' votes on nominees.
- [Bills & Legislation](/wiki/bills-legislation): the tally decides whether each bill passes, fails or goes on.
- [Confirmation Process](/wiki/confirmation-process): whipped votes decide cabinet and court confirmations.
- [Impeachment](/wiki/impeachment): whips shape how NPP blocs vote at each impeachment stage.
- [No Confidence Votes](/wiki/no-confidence-votes): whips on the confidence motion decide whether a government falls.
- [party-ideology](/wiki/party-ideology): Party Ideology: your votes nudge your own positions by up to 0.25 on each axis.
- [npp-behavior](/wiki/npp-behavior): NPP Behavior: whip pressure is one of the forces that decide an NPP's vote.

## Status

Live in every world with a national legislature and parties. Leadership whips for the US Speaker and chamber leaders apply to player votes only; NPPs do not vote in US congressional leadership elections. German chambers do not use leadership election whips and use prime minister appointment and no-confidence whips instead.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Party Whips design page](https://docs.lakesidegames.net/design/party-whips.html).
`;
