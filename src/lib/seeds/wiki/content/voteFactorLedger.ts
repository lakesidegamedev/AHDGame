export const voteFactorLedgerContent = `# Vote Factor Ledger

The factor ledger answers "why does each candidate have the votes they have" in a presidential general. It breaks every candidate's national vote total into the pieces that built it, so you can see whether a lead came from policy fit, name recognition, turnout, the national mood or ground game. It tells you which lever is worth pulling next.

It reads numbers the vote engine already computed and never re-runs the vote math, so the ledger always adds back up to the real result.

## How it works

The ledger is a waterfall. It starts from a structural baseline and adds a signed contribution for each factor:

baseline + sum of every factor's vote delta = final votes

Each factor shows a **vote delta**, the number of votes that factor added (positive) or removed (negative). A few structural factors also show a **multiplier** for quick reading, for example 1.20 on Policy fit means the factor lifted the baseline by 20%. The multiplier is for display only. The vote delta is the real number.

### The factors

The waterfall runs in this order. The last column says what you can do about each one.

| Factor | What it means | What moves it |
| --- | --- | --- |
| State lean and standing | The structural base: each state's partisan lean, party organization, registration, regime, and the approval that favorability drives | Party organization, favorability |
| Policy fit | Alignment of your positions with the electorate. Pure platform fit | Changing your positions |
| Name recognition | The reach your national political influence buys. In the general, influence feeds recognition only | National influence from campaigning and office |
| Turnout | How each state's turnout level scales the vote up or down | [Canvassing](/wiki/canvassing) |
| Persuasion swing | Net votes moved by the turn-to-turn persuasion flow | Ads, rallies and support |
| Spoiler effect | Votes gained or lost through first-past-the-post spoiler transfers | Third-party candidates near you in position |
| National mood | The economy as a referendum, rewarding or punishing the field | The economy and the bills passed before election day |
| Campaign | Ground game: state presence, canvassing, the running mate, governors and campaign strength | [Campaign Presence](/wiki/political-operations), travel, surrogates |
| Tactical voting | Votes that move in the closing period from candidates with no realistic chance in a state to one who has | Being viable locally before the final turns |
| Other | A small residual that absorbs rounding so the waterfall adds up exactly | Nothing |

### Worked example

An illustrative candidate (numbers are made up to show the shape):

| Step | Votes |
| --- | --- |
| Baseline (state lean and standing) | 24,000,000 |
| Policy fit | +3,100,000 |
| Name recognition | +1,400,000 |
| Turnout | -600,000 |
| Persuasion swing | +900,000 |
| Spoiler effect | -400,000 |
| National mood | +1,200,000 |
| Campaign | +2,000,000 |
| Tactical voting | +200,000 |
| Other | 0 |
| **Final votes** | **31,800,000** |

Read it as: this candidate's ground game and policy fit are doing the heavy lifting, while a third party has cost them 400,000 votes and low turnout 600,000. A negative Policy fit means your positions are further from the electorate than your rivals' are, and the cure is to move your positions, not to spend more.

A negative Spoiler effect means a nearby third-party candidate is drawing votes from you. A negative National mood means voters are punishing the party you represent for the economy.

## What you can do

- **Open the Live Election Results page** for a presidential general and choose the ledger for a candidate. See [Live Election Results](/wiki/live-election-results).
- **Compare your ledger with a rival's.** The national waterfall is public for every candidate, so you can see how a rival's total was built.
- **Use the owner-only views** on your own campaign: where your support comes from by voter group (which census groups back you), and per-state ledgers for your closest states. These are hidden from other candidates. Per-state ledgers cover the tightest races, where the factor mix decides the state.
- **Turn it into a plan** with the [Campaign Manager](/wiki/campaign-manager) briefing.

Why you can lose a state you led: the ledger is built from all the factors, and in the closing turns tactical voting, turnout and a rival's ground game can overturn a lead built on policy fit alone.

## Connections

**Driven by**

- [General Elections](/wiki/general-elections): the vote accumulation each turn produces the totals the ledger explains.
- [Election Mechanics](/wiki/election-mechanics): the vote model defines every factor.
- [Political Operations](/wiki/political-operations): Campaign Presence appears in the Campaign factor.
- [Canvassing](/wiki/canvassing): turnout work appears in the Turnout factor.
- [live-election-results](/wiki/live-election-results): Election night shows the same totals the ledger explains.

**Affects**

- [Campaign Manager](/wiki/campaign-manager): its briefing turns these factors into a plan.

## Status

Live for US presidential general elections.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Elections design page](https://docs.lakesidegames.net/design/elections.html).
`;
