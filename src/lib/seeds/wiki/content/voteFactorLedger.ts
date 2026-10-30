export const voteFactorLedgerContent = `# Vote Factor Ledger

The factor ledger answers "why does each candidate have the votes they have" in a presidential general. It breaks the votes every candidate won on the latest counting turn into the pieces that built them, so you can see whether a turn's haul came from policy fit, name recognition, turnout, the national mood or ground game. It tells you which lever is worth pulling next. The vote model in [Election Mechanics](/wiki/election-mechanics) defines every factor, and the [General Elections](/wiki/general-elections) vote accumulation each turn produces the votes the ledger explains.

It reads numbers the vote engine already computed and never re-runs the vote math, so the ledger always adds back up exactly to the votes the engine banked that turn. It is replaced every counting turn; the card says which turn it was read on.

## Reading the waterfall

The ledger is a waterfall. It starts from a neutral baseline, the votes a candidate with no strengths or weaknesses at all would take, and adds a signed contribution for each factor:

baseline + sum of every factor's vote delta = final votes

Each factor shows a **vote delta**, the number of votes that factor added (positive) or removed (negative). Four factors (State lean and standing, Policy fit, Name recognition and Turnout) also show a **multiplier** for quick reading, for example 1.20 on Policy fit means the factor lifted the baseline by 20%. The multiplier is for display only. The vote delta is the real number.

### The ten factors

The waterfall runs in this order. The last column says what you can do about each one.

| Factor | What it means | What moves it |
| --- | --- | --- |
| State lean and standing | The structural pull of everything else on your appeal: party organization, registration, regime, the approval that favorability drives, your state organization and home state, coattails, infamy, targeted ad bonuses and the independent-candidate penalty | Party organization, favorability, state organization |
| Policy fit | Alignment of your positions with the electorate. Pure platform fit | Changing your positions (yours count three quarters, your party's one quarter) |
| Name recognition | The reach your national political influence buys. In the general, influence feeds recognition only | National influence. Long tenure in office wears it down |
| Turnout | How each state's approval rating scales the size of its turnout up or down | State approval |
| Persuasion swing | Net votes moved between parties in each state by the persuasion flow | Support, policy alignment, campaign funds and incumbency |
| Spoiler effect | Votes a third-party candidate takes from the major-party candidate closest to them in position | Third-party candidates near you in position |
| National mood | The economy as a referendum, moving votes to or from the sitting President's party | The economy and the bills passed before election day |
| Campaign | Ground game: canvassing and get-out-the-vote upgrades, field offices, the running mate's home state, governor endorsements and campaign strength | [Ground game](/wiki/canvassing), field offices, governor endorsements, campaign contributions |
| Tactical voting | In the closing turns, part of the new votes of candidates outside a state's top two move to the nearer of the top two | Being in a state's top two before the final turns |
| Other | A small residual that absorbs rounding so the waterfall adds up exactly | Nothing |

### Reading one candidate's ledger

An illustrative candidate (numbers are made up to show the shape):

| Step | Votes |
| --- | --- |
| Baseline | 20,000,000 |
| State lean and standing | +4,000,000 |
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

Read it as: this candidate's standing, ground game and policy fit are doing the heavy lifting, while a third party has cost them 400,000 votes and weak state approval has shrunk turnout by 600,000. A negative Policy fit means your positions sit far from the voters', and the cure is to move your positions, not to spend more.

A negative Spoiler effect means a nearby third-party candidate is drawing votes from you. National mood moves votes between the sitting President's party and everyone else: if you are the President's party, a negative National mood means voters are punishing it for the economy; if you are not, it means they are rewarding the President's party.

## Using it

- **Open the election page** for a presidential general and find the Factor ledger card (the Factor ledger tab under Race detail). Pick a candidate; it opens on the leader. [Live Election Results](/wiki/live-election-results) shows the running totals on election night.
- **Compare your ledger with a rival's.** The national waterfall is public for every candidate, so you can see how a rival's turn was built.
- **Check where your support comes from.** On your own candidate the card adds the census groups that make up your appeal. This is hidden from other candidates.
- **Turn it into a plan** with the [Campaign Manager](/wiki/campaign-manager) briefing, which uses the same data to list the voter groups you are losing worst.

Why you can lose a state you led: the ledger is rebuilt from all the factors every turn, and in the closing turns tactical voting, approval-driven turnout and a rival's ground game can overturn a lead built on policy fit alone.

Live for US presidential general elections. Last checked 2026-10-30, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html)
`;
