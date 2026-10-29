export const unionsContent = `# Unions

**Unions** are the organised side of [Labour & Wages](/wiki/labour-and-wages). Each sector carries a unionization score; the higher it is, the more labour costs, and the more likely workers are to strike. Players can also found and run unions, organise workplaces and bargain with employers. If you run a corporation, unions are a standing cost and a risk. If you want to shape wages and politics, they are a lever.

## How it works

Each corporate sector has a **unionization** score from 0 to 100. Every turn it moves up to 1.5 points toward a target, starting from a baseline of 20. Several things push the target:

| Factor | Direction |
| --- | --- |
| Real wages below cost-of-living-adjusted expectations | Up |
| High unemployment | Down |
| Weak minimum-wage protection (low Kaitz ratio) | Up |
| Pro-labour union law (country legislation) | Up |
| Player-run union recruitment in that sector | Up |

### Key numbers

| Rule | Value |
| --- | --- |
| Standing labour premium | Unionization / 100 x 15 percentage points added to labour cost (15% at 100) |
| Strike trigger | Unionization above 55 and real wages at least 0.12 below worker expectations |
| Strike length | 4 turns |
| Strike effect | Sector revenue falls 25% and margin falls 8 points |
| Strike ends early | When the expectation gap closes to 0.04 or less (a wage concession) |
| Cooldown after a strike | 12 turns |
| Wait-out result | Unionization rises 10 points |
| Union-law shift | Right-to-work or bargaining law moves the strike threshold by up to 10 points |
| Union-busting | Costs half of daily sector revenue (min 1,000); success -20 unionization, failure +15; 12-turn cooldown |
| Organize drive | 5 action points, +10 strength to the union and to you |
| Shop-floor organize | 1 action point plus treasury; +5 x approval / 100 unionization |
| Leadership race opens at | 100 union strength |
| Ratification vote | 3 turns |
| Bargaining deadline | 8 turns, then a dispute that lapses after 16; 8-turn cooling off |
| Pension contribution | Up to 15% of covered wage bill; deficit below 90% funded |

The two thresholds for a strike (trigger at 0.12, concession at 0.04) are deliberately far apart so wages cannot be flipped up and down to game it.

### Worked example

A manufacturing sector has unionization 60 and labour costs of ₳100,000 a day. Its standing premium is 60 / 100 x 15 = 9 points, so labour costs ₳109,000. The CEO has held wages at level 1.0 while local living costs rose, so real wages sit 0.15 below worker expectations. That is above 0.12 and unionization is above 55, so a strike starts.

For 4 turns the sector's revenue falls 25% (a ₳1,000,000 sector drops to ₳750,000) and its margin takes an 8 point hit. The CEO can raise the wage level until the gap falls under 0.04 and the strike ends, wait it out (and see unionization jump 10 points to 70), or try union-busting for ₳500,000. Busting has a chance of cutting unionization by 20 but a chance of adding 15 instead.

A cooldown of 12 turns then stops another strike straight away.

## Strikes

When unionization is high **and** real wages lag a slow-moving **worker expectation index** by enough, a sector can enter a **strike** (bounded-duration event):

- **Revenue throttle**: active strikes cut sector revenue by 25%.
- **Margin penalty**: an additional 8 point profit-margin hit while the strike runs.
- **Resolution paths:**
  - **Concession**: CEO raises wage level until the expectation gap closes; strike ends, cooldown begins.
  - **Wait it out**: strike expires after 4 turns; unionization bumps up ("radicalization").
  - **Union-busting**: CEO action to break the strike (see below).

## Union law

Countries can enact **union-law** legislation on a right-to-work to collective-bargaining axis. The active option biases unionization drift targets and strike trigger thresholds (easier or harder to walk out). Union law gives governments a political lever independent of corporate wage sliders. In some countries unions are banned outright, and unionization there decays 3 points a turn.

## Player-run unions

Players can found and operate **unions** covering a country + sector type. Owned unions contribute **membership pressure** to unionization drift in matching sectors: organizing becomes a gameplay loop parallel to running a corporation.

Unions have their own pages, listed on the Unions page.

Three mechanics give the membership a direct role: rank-and-file organizing, weighted leadership votes, and ratification ballots on every settlement.

### Rank-and-file organizing

Any character in the union's country can run an **organize drive** on any of that country's unions, led or not. It is the one union action that is not reserved for the president. A drive costs **5 action points**, not cash, so participation tracks turning up rather than net worth (a suspended or outlawed union cannot be organized).

Each drive adds **10 strength** to two places at once:

- The **union's pool**, which feeds its organizing score, dues income, unionization drift and strike capacity.
- Your own **banked strength** with that union, a personal, permanent record of the drives you ran.

The banked figure is your voice in everything below.

### Shop-floor organizing

The union president can organize a specific workplace from the union's Sectors tab (or from that sector's own page). A drive costs **1 action point** and a treasury spend, and raises that shop's unionization by **5 points times the union's approval, divided by 100** (a union at 55 approval adds 2.75 points). A well-liked union organizes faster. If another union already holds the shop, the same button is a raid.

### Weighted leadership votes

Organizers contest the presidency the same way shareholders contest a CEO seat: continuously, weighted by **banked organizing strength**, not one per head. Someone who ran fifty drives outvotes someone who ran one. Once the union reaches the strength threshold, the race stays open whether or not a president already sits, including against an NPP holder. The plurality leader is offered the seat and must accept; a tie keeps the sitting player president. Leadership follows organizing effort: the way to control a union is to build it.

### Ratification ballots

A settlement no longer takes effect on the president's signature. When the president moves to accept an employer's offer, the offer goes to a **ratification vote** of the members instead. Every organizer holding banked strength when the vote opens gets a ballot, weighted by that strength; the weights are frozen at open, so organizing during the vote buys you nothing until the next one. If nobody holds any strength, there is no electorate to ask and the president settles directly, as before.

The vote runs for **3 turns**, and the campaign clocks keep running underneath it: a president cannot park a campaign in a ballot to dodge the deadline. It closes early the moment one side holds a majority of **all** snapshot strength, since the result can no longer change. At the deadline, ratify wins on a tie, and silence counts for the settlement: an unanswered ballot leaves the president's acceptance standing, so an inactive membership cannot veto every deal by apathy. You can change your vote while the ballot is open.

**Ratified**: the collective agreement takes force exactly as a signed settlement always did, on the terms the members were shown.

**Rejected**: the employer's offer stays on the table and nothing else changes. The bargaining deadline still runs the campaign into dispute and the dispute still lapses, so a membership that rejects everything ends the campaign by the existing exits rather than freezing it. The president cannot simply re-table the identical offer to the same electorate; the way back to a vote is to move the package with a counteroffer.

## Union-busting

CEOs can attempt **union-busting** on a striking or highly unionized sector. It costs half the sector's daily revenue (at least 1,000). Success cuts unionization by 20 points; a failed attempt backfires and adds 15. There is a 12-turn cooldown. It is a high-risk management tool, not a free reset, and it can cost goodwill with workers.

## Pension schemes

The state pension is a budget line: the social-insurance law sets what the country pays out of tax, and every worker gets it. A union pension scheme is different: a fund holding real assets, won as a term of a collective agreement.

**How one starts.** A union bargains a pension contribution as a term of a collective agreement, alongside the wage floor and the labour peace. The contribution is a percentage of the wage bill of the workplaces the agreement covers, up to 15%. Settle an agreement carrying a contribution and the scheme exists from that turn.

**Where the money comes from.** The employer, out of its own cash, every turn the agreement runs. Nothing is created for the scheme: if the employer cannot pay, nothing arrives.

**What the scheme owes.** Every turn covered workers are covered, they accrue a claim on the scheme. That is the number the assets are measured against, and the ratio between the two is the funding level. A scheme funded below the rate at which claims accrue falls further behind every turn, no matter how long it runs, so the contribution rate a union settles for is a real choice with a visible consequence.

**When it falls short.** Below 90% funded, the employer is asked for a top-up every turn, sized to a fraction of the shortfall rather than the whole of it. A deficit closes over game-years, not in one payment, because a top-up big enough to close it at once would break the employer instead.

**What an employer that cannot pay does not get.** Forgiveness. A missed contribution does not cancel the claim: the promise stands and the assets simply do not arrive, which is exactly how a scheme ends up underfunded.

**Who gets paid.** Members retire, and a retired member draws a pension from the scheme every turn. Benefits come out of the scheme's own cash and nowhere else. Paying a pension also discharges the claim behind it, so a scheme that pays its way improves its funding level as it goes.

**When the money is not there.** Pensions are cut, and every pensioner takes the same proportional cut. The scheme does not overdraw and it does not invent the difference. The unpaid part is not written off either: the claim stays on the books, the scheme still reads as underfunded, and the employer is still asked for a top-up next turn. This is the consequence the funding ratio has been warning about the whole time.

**Where the assets sit.** A scheme invests its spare cash in the broad index fund for its country, or the global broad index if its country has none. Not a sector fund: a pension whose assets collapse in the same turn its employer does is not a pension. The scheme keeps a cash buffer back first, enough for several turns of benefits, so investing can never itself be the reason a pension is cut.

**How investing shows up in the funding level.** The scheme's assets are its cash PLUS the current value of the fund units it holds, marked at today's quoted price. Moving cash into a fund does not change the funding ratio at all. A fund that rises does raise it, and lets the employer off a top-up; a fund that falls lowers it, and costs the employer more. That is the trade a funded scheme makes.

**With index funds switched off.** Schemes simply hold cash. Contributions, claims, benefits, cuts and top-ups all work exactly as described above.

## What you can do

- **As a CEO:** watch the unionization and expectation gap on each sector. Keep wages near what local costs justify, and raise the wage level before the gap passes 0.12. Treat union-busting as a gamble.
- **As an organiser:** run organize drives (5 action points each) to build banked strength, which is your vote in leadership and ratification ballots. Presidents can organise single shops for 1 action point plus treasury.
- **As a union president:** bargain with employers and take settlements to a ratification vote. Pension contributions are a term you can win.
- **As a legislator:** union law is a political lever. See [Bills & Legislation](/wiki/bills-legislation).

## Connections

**Driven by**

- [Labour & Wages](/wiki/labour-and-wages): real wages against expectations and minimum-wage protection push unionization.
- [Corporations](/wiki/corporations): CEO wage levels and union-busting choices change unionization.
- [Bills & Legislation](/wiki/bills-legislation): union law shifts drift targets and strike thresholds.
- [National Metrics](/wiki/national-metrics): high unemployment lowers union pressure.
- [Pensions](/wiki/pensions): The scheme's funding ratio is the argument both sides use at the next bargaining round.

**Affects**

- [Labour & Wages](/wiki/labour-and-wages): the standing premium raises labour cost, and settlements set wage floors.
- [Corporations](/wiki/corporations): strikes cut revenue and margin, and settlements bind the employer.
- [Pensions](/wiki/pensions): union pension schemes add to retirement income for covered workers.
- [Government Approval](/wiki/government-approval): A union ban with a crackdown costs 2 approval points.

## Status

Unions run in every world that has private sectors and allows unions. Countries that ban unions have none, and command economies have no private sectors to organise. Right-to-work or collective-bargaining law varies by country and era.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Labour design page](https://docs.lakesidegames.net/design/labour.html).
`;
