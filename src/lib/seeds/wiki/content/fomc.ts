export const fomcContent = `# FOMC / Rate-Setting Board

The **US Federal Reserve** sets its prime rate by committee, not by one person. A 7-seat board, the FOMC, meets every 8 turns. The chair proposes a hike, cut or hold and the governors vote. Every other central bank keeps its single-governor or government-controlled model, and command economies keep a passive monobank. If you play a US character, this is how the country's interest rate gets set. See [Central Banks](/wiki/central-banks) for scrutiny, the exchange-rate regime and what the rate does.

## How it works

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

**A meeting, step by step.**

1. A meeting opens when the board is due and at least one governor is seated.
2. The chair's motion is set automatically from the chair's own reading of inflation and growth: hike, cut or hold, with a signed rate change. If the 16-change cap is reached or the 6-turn wait is still running, the motion is a hold.
3. NPP seats vote at once, from the same rule an autonomous chair uses, tilted hawk (leans to hike) or dove (leans to cut).
4. Player governors vote within 24 hours. No ballot counts as an abstain.
5. The motion is decided as soon as it has a majority, or can no longer reach one. Otherwise it closes when every seated player has voted, or at the deadline. A meeting never resolves on the turn it opened.
6. If it passes, the rate moves and the change counts toward the 16.

![Flow of an FOMC meeting from the due date and automatic motion through NPP and player votes to a majority decision that moves the rate or fails.](/wiki-images/diagrams/fomc-meeting-flow.svg)

**Vacant seats.** The engine does not staff the board. When a term runs out the seat falls vacant and stays that way until the President nominates and the Senate confirms a successor. Vacant seats do not count toward a majority, so five seated governors need three votes. A governor without a ballot abstains, which makes the board lean toward holding when members do not show up.

If **no governors are seated**, meetings pause and the chair sets the rate directly with the normal Prime Rate controls, under the usual wait and size limits. An autonomous (NPP) chair does the same through its Taylor-rule setter. Meetings resume once a governor is confirmed.

**Worked example.** Five seats are filled (three NPP governors and two players, one of them the chair) and two seats are vacant. A majority of five is 3. The chair's automatic motion is a 0.50 hike. The NPP seats vote when the meeting opens: hike, hike, hold. One player then votes hike, which makes 3 votes. The motion is decided at once, and it takes effect on the next turn, because a meeting never resolves on the turn it opened. If the NPPs had voted hold, hold, hold, the motion could reach at most 2 votes with both players behind it, so it would fail early.

**Why a cap.** The 16-change limit stops a board from using the rate as a constant dial. After 16 moves in a term it can still meet and hold.

## What you can do

- **Vote as a governor.** Open the FOMC tab on the Central Bank page during a meeting and cast hike, cut or hold. You are agreeing with the motion only if your vote matches its direction.
- **Table your motion as chair.** A player chair can replace the automatic motion with their own, but only before any player governor has voted. The new motion still has to respect the size limits and the 16-change cap.
- **Nominate, as President.** Fill a vacant seat or the chair seat. The nomination appears in the Senate confirmations panel with the nominee, the seat, whether they are a player or NPP, the running tally and the closing time. Sitting Senators vote For, Against or Abstain. See [Confirmation Process](/wiki/confirmation-process).
- **Get a seat as a player.** You need a nomination from the President and a Senate majority. There is no lobbying pool and no draw.

Tips: vote early, since a decided motion can close before the deadline. Count seated governors, because a board with two vacancies needs fewer votes than a full one. NPP seats have already voted when a meeting opens, so before you table a motion against the way most of them lean, expect it to fail.

## Connections

**Driven by**

- [Central Banks](/wiki/central-banks): chair term, scrutiny, the 6-turn wait and the move sizes bound what the committee can do.
- [National Metrics](/wiki/national-metrics): inflation and growth set the motion and how NPP seats vote.
- [Confirmation Process](/wiki/confirmation-process): the Senate decides who sits on the board.

**Affects**

- [Central Banks](/wiki/central-banks): a passed motion sets the US prime rate.
- [Currency Exchange](/wiki/currency-exchange): a new US prime rate moves the dollar's target.

## Status

Live in US worlds. Every other country uses the governor or government model, and command economies have no committee. Seats are empty until the President fills them, so a new world may start with gaps.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact meeting, ballot and tally rules are on the [monetary system design page](https://docs.lakesidegames.net/design/monetary-system-as-shipped.html).
`;
