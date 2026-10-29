export const fomcContent = `# FOMC / Rate-Setting Board

In the United States no single person can move the interest rate. A seven-seat board, the FOMC, meets every 8 turns, the chair proposes a hike, cut or hold, and the governors vote. If you play a US character, a seat on this board is the closest thing to a hand on the dollar's price of money. Every other central bank keeps its single-governor or government-controlled model, and command economies keep a passive monobank. See [Central Banks](/wiki/central-banks) for scrutiny, the exchange-rate regime and what the rate does.

## Who sits on the board

The engine does not staff the board. When a term runs out the seat falls vacant and stays that way until the President nominates and the Senate confirms a successor. A new world may start with gaps.

| What | Value |
| --- | --- |
| Seats | 7, chair included (seat 1 is the chair seat) |
| Term | 192 turns (4 game years), staggered so seats do not all open together |
| Meeting | Every 8 turns (6 per game year) |
| Player voting window | 24 hours, which is the same as the 24-turn deadline |
| To pass | A strict majority of seated governors |
| Rate changes per term | 16. Holds are free |
| Wait between rate changes | 6 turns |
| Move size | Same limits as any chair: up to 0.75 up, 1.75 down, 3 up when inflation is 5 points over target |

To get a seat as a player you need a nomination from the President and a Senate majority. There is no lobbying pool and no draw. As President, you fill a vacant seat or the chair seat; the nomination appears in the Senate confirmations panel with the nominee, the seat, whether they are a player or NPP, the running tally and the closing time. Sitting Senators vote For, Against or Abstain. See [Confirmation Process](/wiki/confirmation-process).

Vacant seats do not count toward a majority, so five seated governors need three votes. A governor without a ballot abstains, which makes the board lean toward holding when members do not show up.

If **no governors are seated**, meetings pause and the chair sets the rate directly with the normal Prime Rate controls, under the usual wait and size limits. An autonomous (NPP) chair does the same through its Taylor-rule setter. Meetings resume once a governor is confirmed.

## How a meeting plays out

1. A meeting opens when the board is due and at least one governor is seated.
2. The chair's motion is set automatically from the chair's own reading of inflation and growth (from [National Metrics](/wiki/national-metrics)): hike, cut or hold, with a signed rate change. If the 16-change cap is reached or the 6-turn wait is still running, the motion is a hold.
3. NPP seats vote at once, from the same rule an autonomous chair uses, tilted hawk (leans to hike) or dove (leans to cut).
4. Player governors vote within 24 hours. No ballot counts as an abstain.
5. The motion is decided as soon as it has a majority, or can no longer reach one. Otherwise it closes when every seated player has voted, or at the deadline. A meeting never resolves on the turn it opened.
6. If it passes, the rate moves and the change counts toward the 16.

![Flow of an FOMC meeting from the due date and automatic motion through NPP and player votes to a majority decision that moves the rate or fails.](/wiki-images/diagrams/fomc-meeting-flow.svg)

Picture a board with five seats filled (three NPP governors and two players, one of them the chair) and two seats vacant. A majority of five is 3. The chair's automatic motion is a 0.50 hike. The NPP seats vote when the meeting opens: hike, hike, hold. One player then votes hike, which makes 3 votes. The motion is decided at once, and it takes effect on the next turn, because a meeting never resolves on the turn it opened. If the NPPs had voted hold, hold, hold, the motion could reach at most 2 votes with both players behind it, so it would fail early.

## Your vote and your motion

Open the FOMC tab on the Central Bank page during a meeting and cast hike, cut or hold. You are agreeing with the motion only if your vote matches its direction.

A player chair can replace the automatic motion with their own, but only before any player governor has voted. The new motion still has to respect the size limits and the 16-change cap. The cap exists to stop a board from using the rate as a constant dial; after 16 moves in a term it can still meet and hold.

Vote early, since a decided motion can close before the deadline. Count seated governors, because a board with two vacancies needs fewer votes than a full one. NPP seats have already voted when a meeting opens, so before you table a motion against the way most of them lean, expect it to fail.

A passed motion sets the US prime rate, and the chair term, scrutiny, wait and move sizes in [Central Banks](/wiki/central-banks) bound what the committee can do. A new prime rate moves the dollar's target on [Currency Exchange](/wiki/currency-exchange).

Live in US worlds only. Every other country uses the governor or government model, and command economies have no committee. Last checked 2026-10-29, version 1.18.0. Exact rules: [Monetary system (design)](https://docs.lakesidegames.net/design/monetary-system-as-shipped.html)
`;
