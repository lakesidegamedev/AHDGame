export const readingTheGameContent = `# Reading the Game

The game never stops generating numbers: elections resolve, bills advance, NPPs act and metrics shift every hour. Most of them are noise for any one decision. This page shows which screens to open before you commit actions, and what to read off each of them.

## The dashboard: what to check first

The dashboard link (\`/dashboard\`) opens your profile page, your primary situational awareness screen. Together with the bar at the top of every page it shows:

- **Turn timer**: The status bar at the top of every page counts down to the next turn (hourly). Plan your actions around this.
- **Your character's stats**: Current actions and the per-turn breakdown, funds, favorability, political influence.
- **Your current office** (if any) and your career history.
- **Notifications**: Turn-driven events (election results, bill updates, party actions) under the notification bell in the top bar.

Races you are entered in are tracked on the elections page and your campaign page.

---

## National metrics and approval

National metrics are the economic and social health indicators for each country. Find them on the country's metrics page (e.g., \`/country/us/metrics\`); the overview page carries the approval rating.

Key metrics to monitor:

| Metric | What it reflects | Why it matters |
|---|---|---|
| GDP index | Economic output | Affects corporate revenue, bond ratings |
| Inflation | Price level change | Affects purchasing power, central bank policy |
| Healthcare index | Public health quality | Feeds state and national approval |
| Education index | Education system quality | Feeds state and national approval |
| Environment index | Environmental health | Feeds approval, weighted by the state's voter groups |

Metrics trend slowly: a single policy bill rarely causes dramatic movement. A law moves a metric a little each turn toward its target, so watch the trend direction over many turns after major legislation passes to see the effect.

The **national approval rating** on the country page is computed from the country's own metrics against the national picture, with national effects (a war, a national address, international statements, the state of the cabinet) layered on top; it does not track any one politician's favorability. See [Government Approval](/wiki/government-approval).

---

## Watching the races

The elections page (\`/elections\` takes you to \`/country/<code>/elections\` for your country) lists all active elections with:

- **Phase** (primary or general) and time remaining
- **Candidates** and their projected standings (from polling, if available)
- **Primary score leaders** (during primary phase)

In the **primary phase:** Look at the registered candidates and their party affiliations. If a player is in the primary, NPPs receive the 0.5× penalty. Running a Quick Poll (2 actions, ₳25k) at any point during the primary shows your projected standing vs. the field; once the primary's closing window opens, the race page shows the cumulative ballot shares that actually decide it.

In the **general phase:** Vote totals accumulate each turn. The candidate list shows running vote totals. Final-4-turn weighting means leads can close fast, so don't assume a 15% lead is safe with 3 turns left.

**Key elections to watch:**
- Presidential elections: National stakes, Electoral College math
- Senate elections: Control of the chamber determines legislative agenda
- Governor races: State-level approval and bill-signing power
- Parliamentary majority tracking (UK/DE/JP): Party seat counts determine who becomes PM/Chancellor

---

## What the last turn left behind

Each turn, the game generates a log of everything that happened. You won't see the raw log as a player, but its effects surface as:

**Notifications**: Direct events (your election resolved, your bill passed, you received an endorsement). Check the notification bell regularly.

**Election results**: The elections page updates immediately after turn processing with new standings and any resolved races.

**Metric changes**: State and national metrics update after each turn. If you're tracking a specific metric, check it the turn after a related policy passes.

**Campaign activity history**: Your campaign page keeps an activity log of upgrades and downgrades (including automatic downgrades when maintenance goes unpaid) and a per-turn history of campaign money.

---

## Party standings and majority thresholds

Party standings matter for both elections and legislation. Monitor them across a few screens:

- **Seat counts by chamber** (legislature page): Which party has the majority?
- **Party org by state** (your party's page and state party pages): Is your home-state party org above 70?
- **Membership** (parties page and your party's members list): How large is each party?

In parliamentary countries (UK, DE, JP, IE), track whether any party is approaching the majority threshold (a bare majority of the chamber: UK 326 of 650, JP 233 of 465, IE 81 of 160, DE 316 of 630 in the modern preset or 244 of 487 in the 1953 one). After each election a government formation opens automatically, and the PM is seated by an appointment vote in the chamber, so the majority (or a coalition that reaches it) decides who governs.

For US presidential politics, track **party org in swing states** specifically: a party badly out-organised in a swing state is handing its rival a structural edge there before a single ad runs.

---

## Sizing up the NPPs

NPPs vote on bills, enter elections, and fill legislative seats. Knowing the ideology distribution of NPPs in your target chamber helps predict:

- Which bills can pass with NPP support
- Which primaries have NPP competition and whether you'll beat the 0.5× penalty threshold
- Which party's NPPs are vulnerable to player challengers

NPP profiles open from chamber rosters, party member lists and the politicians page. Look at their econ/social position to gauge how they'll vote on ideologically loaded legislation.

---

## Polls: which one to buy

Polling is the most direct diagnostic tool for electoral decision-making:

**Quick Poll (2 actions, ₳25k):** Shows your overall appeal score and 5 strongest/weakest demographic groups. Use this:
- Before declaring candidacy (to decide if the race is winnable)
- After a major policy change or ad campaign (to measure impact)
- Early in campaign season (to identify groups to canvass)

**Full Demographic Poll (6 actions, ₳75k):** Shows your appeal across every segment of the state's electorate. Use this:
- When you need to allocate a large ad budget
- When a race is close and you need to find pockets of untapped support
- Before the final 4-turn campaign season sprint

Poll projections use the same turnout inputs and vote math as actual vote accumulation, but they estimate only the next slice of voters and cannot see rivals' targeted ads, so treat them as close estimates.

---

## Party org, the invisible lever

Party org is often invisible until something breaks. Check it:

1. Go to your party's state org page
2. Look at the org value (0 to 100) for your home state and target states, and compare it with your rivals' in the same state
3. What matters is your **share** of the state's total org. A party with a fraction of a rival's org still gets a real weight thanks to diminishing returns, but a party with no org in a state gets no org weight there (a well-known candidate keeps only a small personal floor)

If org is low, the party's national or state chair, vice chair or an appointed campaigner can build it. As a party member, you can lobby them to prioritize your target states. If you are the chair, prioritize org in states with the most competitive general elections.

---

## The economic screens

If you're involved in the economy (corporations, bonds, forex), check:

**Corporate financials**: Revenue per sector, net income, and how they changed turn to turn. Rising sectors signal effective economic policy; falling sectors may need intervention.

**Bond yields**: The bond market page shows current yields by country. A widening spread between countries signals relative credit risk or interest rate divergence, useful for forex positioning.

**Central bank rates**: The central bank page for each country shows the current prime rate and rate history. Rate changes affect corporate borrowing costs and exchange rates.

**Wealth rankings**: The wealth list on the market page ranks players by net worth. If you're falling behind, your corporate or investment strategy needs adjustment.

---

## Going deeper

[Polling](/wiki/polling) compares the Quick Poll with the Full Poll in detail. [Reference: Turn Order](/wiki/reference-turn-order) shows what happens each turn and [Reference: Formulas](/wiki/reference-formulas) holds the math behind what you are reading. [Advanced Strategy](/wiki/advanced-strategy) turns the data into decisions, and [Endgame Goals](/wiki/endgame-goals) says what to aim for once you understand the game.
`;
