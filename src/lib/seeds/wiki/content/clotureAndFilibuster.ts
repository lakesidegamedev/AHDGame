export const clotureAndFilibusterContent = `# Cloture & the Filibuster

In the US Senate, any seated senator can filibuster a bill that is on the floor. It does not kill the bill. It extends the vote by about 12 hours and raises the bar to pass from a simple majority to **three fifths of the votes cast**, the cloture threshold. There is no separate cloture motion: cloture is the passing rule the bill is held to once it has been filibustered.

## How it works

1. A bill is open for a vote in the US Senate, as the origin chamber or the second chamber.
2. A senator pays 25 action points and 5 NPI and invokes the filibuster from the bill page. The Senate deadline moves back by about 12 hours.
3. When the vote closes, the bill passes only if For is at least 60 percent of For plus Against plus Abstain, rounded up to a whole vote.
4. If the Senate has abolished the filibuster, the bill is judged by simple majority again.

### Key numbers

| Item | Value |
| --- | --- |
| Cost per invocation | 25 action points and 5 NPI, spent even if the bill passes |
| Delay added | 12 hours at average Statecraft; about 10 hours at Statecraft 1 and 14 hours at Statecraft 10 |
| Threshold | Smallest whole number at or above 60 percent of For + Against + Abstain |
| Invocations | Once per senator per bill; the threshold never stacks, each extra one adds another delay |
| Two-thirds bills | Already above cloture, so the filibuster check is skipped |

### Worked example

A 100 seat Senate. A bill gets 57 For, 38 Against and 5 senators who never vote.

\`\`\`wiki-chart
cloture-votes-required
\`\`\`

- Votes cast are 95 (the 5 who never voted do not count). The bar is ceil(0.6 x 95) = 57. The bill passes with exactly 57.
- Now suppose those 5 senators vote Abstain instead. Votes cast are 100 and the bar is 60. The same 57 For now fails.

So a bloc that wants to sink a filibustered bill can abstain rather than vote Against, and a sponsor must win over abstainers, not just count Against votes.

### Why it works this way

The bar is based on votes cast rather than on seats so that a quiet chamber does not help a filibuster, but an abstention still counts against the bill. That makes the choice between abstaining and voting Against a real decision.

## What you can do

- **Invoke the filibuster** if you hold a Senate seat. Open the bill from the Congress page and use the **Filibuster** action while the bill is being voted on in the Senate. You need 25 action points and 5 NPI. Invoking trains your Statecraft stat, and stronger Statecraft gives a longer delay.
- **Defeat one** by building 60 percent among votes cast, or by winning over would-be abstainers.
- **Abolish it** by passing the Senate Filibuster Rules Act (see below).

Tips: ask supporters to vote, not to stay away, if a filibuster is likely, and ask opponents to abstain or vote Against depending on how close the count is.

### Who and when

- Only the US Senate. Other countries and the US House have no filibuster.
- Only seated senators, and only while the bill is actively before the Senate. A bill in the House, on the president's desk or in a veto override cannot be filibustered.
- Not on concurrent votes, where both chambers vote at once on separate clocks.
- Banned parties in a one-party state cannot act on legislation at all.
- It never applies to leadership elections, confirmations or veto overrides.

### What it does not do

It does not park or kill the bill. The vote stays open and the status does not change. Ten filibusters on one bill still mean one three-fifths test.

## Abolishing the filibuster

The **Senate Filibuster Rules Act** is a Senate-only national bill with three options.

| Option | Effect |
| --- | --- |
| Nuclear Option Act | Abolishes the filibuster. Senators cannot invoke it, and a bill already filibustered is judged by simple majority. |
| Talking Filibuster Reform Act | Keeps the filibuster and the three-fifths threshold. |
| Filibuster Preservation Act | Keeps the filibuster and the three-fifths threshold. |

Only abolition changes anything. While it is in force the Filibuster button is unavailable and earlier invocations on open bills are ignored at the count, so a rules change mid-vote takes effect when the vote closes.

## Connections

**Driven by**

- [Voting & Whips](/wiki/voting-and-whips): how many senators vote For, Against or Abstain sets the count that is tested against 60 percent.
- [Congress Leadership](/wiki/congress-leadership): floor leaders organise the whip count and the abstention strategy.
- [Rpg Stats](/wiki/rpg-stats): Statecraft changes how long the delay lasts.

**Affects**

- [Voting & Whips](/wiki/voting-and-whips): a filibuster raises the share of For votes a Senate bill needs, so whip counts change.
- [Bills & Legislation](/wiki/bills-legislation): a filibuster lengthens a bill's Senate stage and raises its passing bar.

## Status

Live in worlds with a US-style Senate. Not used in any other country. The Senate can switch it off with the Senate Filibuster Rules Act.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are covered on the [Bills & legislation design page](https://docs.lakesidegames.net/design/bills-legislation.html); there is no separate filibuster design page.
`;
