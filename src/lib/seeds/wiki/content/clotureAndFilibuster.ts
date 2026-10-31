export const clotureAndFilibusterContent = `# Cloture & the Filibuster

A senator can add 12 hours to a Senate vote and raise the bar to three fifths, and the 57 votes that pass a bill can fail it if 5 senators who sat it out vote Abstain instead. In the US Senate, any seated senator can filibuster a bill that is on the floor. It does not kill the bill. It extends the vote by about 12 hours and raises the bar to pass from a simple majority to **three fifths of the votes cast**, the cloture threshold. There is no separate cloture motion: cloture is the passing rule the bill is held to once it has been filibustered.

## Invoking it

1. A bill is open for a vote in the US Senate, as the origin chamber or the second chamber (see [Bills & Legislation](/wiki/bills-legislation), where a filibuster lengthens a bill's Senate stage and raises its passing bar).
2. A senator pays 25 action points and 5 NPI and invokes the filibuster from the bill page. The Senate deadline moves back by about 12 hours. Open the bill from the Congress page and use the **Invoke filibuster** button while the bill is being voted on in the Senate. Invoking trains your Statecraft stat, and stronger Statecraft gives a longer delay (see [Rpg Stats](/wiki/rpg-stats)).
3. When the vote closes, the bill passes only if For is at least 60 percent of For plus Against plus Abstain, rounded up to a whole vote.
4. If the Senate has abolished the filibuster, the bill is judged by simple majority again.

![Decision tree of the conditions a senator must meet to invoke a filibuster, ending in the cost, the added delay and the three-fifths bar.](/wiki-images/diagrams/cloture-and-filibuster-filibuster-checks.svg)

![Senate bill page with the Invoke filibuster button and the seating chart for the floor vote](/wiki-images/screens/cloture-and-filibuster-senate-bill.webp)

| Item | Value |
| --- | --- |
| Cost per invocation | 25 action points and 5 NPI, spent even if the bill passes |
| Delay added | 12 hours at average Statecraft; about 10 hours at Statecraft 1 and 14 hours at Statecraft 10 |
| Threshold | Smallest whole number at or above 60 percent of For + Against + Abstain |
| Invocations | Once per senator per bill; the threshold never stacks, each extra one adds another delay |
| Two-thirds bills | Already above cloture, so the filibuster check is skipped |

## Why an abstention counts against you

A 100 seat Senate. A bill gets 57 For, 38 Against and 5 senators who never vote.

\`\`\`wiki-chart
cloture-votes-required
\`\`\`

- Votes cast are 95 (the 5 who never voted do not count). The bar is ceil(0.6 x 95) = 57. The bill passes with exactly 57.
- Now suppose those 5 senators vote Abstain instead. Votes cast are 100 and the bar is 60. The same 57 For now fails.

So a bloc that wants to sink a filibustered bill can abstain rather than vote Against, and a sponsor must win over abstainers, not just count Against votes. The bar is based on votes cast rather than on seats so that a quiet chamber does not help a filibuster, but an abstention still counts against the bill. That makes the choice between abstaining and voting Against a real decision.

How many senators vote For, Against or Abstain sets the count that is tested against 60 percent, so a filibuster raises the share of For votes a Senate bill needs and whip counts change (see [Voting & Whips](/wiki/voting-and-whips)). Floor leaders organise the whip count and the abstention strategy (see [Congress Leadership](/wiki/congress-leadership)).

Tips: ask supporters to vote, not to stay away, if a filibuster is likely, and ask opponents to abstain or vote Against depending on how close the count is.

## Beating a filibuster

- **Defeat one** by building 60 percent among votes cast, or by winning over would-be abstainers.
- **Abolish it** by passing the Senate Filibuster Rules Act (below).

### Who and when

- Only the US Senate. Other countries and the US House have no filibuster.
- Only seated senators, and only while the bill is actively before the Senate. A bill in the House, on the president's desk or in a veto override cannot be filibustered.
- Not on concurrent votes, where both chambers vote at once on separate clocks.
- Banned parties in a one-party state cannot act on legislation at all.
- It never applies to leadership elections, confirmations or veto overrides.

It does not park or kill the bill. The vote stays open and the status does not change. Ten filibusters on one bill still mean one three-fifths test.

## Abolishing the filibuster

The **Senate Filibuster Rules Act** is a US national bill with three options. It goes through the normal national bill process, so it needs both chambers and the president like any other national bill.

| Option | Effect |
| --- | --- |
| Nuclear Option Act | Abolishes the filibuster. Senators cannot invoke it, and a bill already filibustered is judged by simple majority. |
| Talking Filibuster Reform Act | Keeps the filibuster and the three-fifths threshold. |
| Filibuster Preservation Act | Keeps the filibuster and the three-fifths threshold. |

Only abolition changes anything. While it is in force the Invoke filibuster button still shows, but using it is refused, and earlier invocations on open bills are ignored at the count, so a rules change mid-vote takes effect when the vote closes.

Live in worlds with a US-style Senate. Not used in any other country. Congress can switch it off by enacting the Nuclear Option Act.

Last checked 2026-10-29, version 1.18.0. Exact rules: [Bills & legislation design page](https://docs.lakesidegames.net/design/bills-legislation.html) (there is no separate filibuster design page)
`;
