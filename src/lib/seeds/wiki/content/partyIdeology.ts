export const partyIdeologyContent = `# Party Ideology

Every party and every character has a position on a two-axis grid. How close your positions are to your party's, and to your state's, is the biggest part of your primary score, and it shapes how voter groups respond to you in general elections. If you want to win your party's nomination, you need to know how far you can drift from the party line.

## How it works

Positions run from **-5 to +5** on two independent axes.

| Axis | -5 | +5 |
| --- | --- | --- |
| Economic | Far left (state ownership, high taxes) | Far right (free market, low taxes) |
| Social | Progressive | Conservative |

Both axes count equally. Your character has its own pair of positions, and so does your party. They do not have to match. The gap costs you primary points.

### Primary alignment

In a state primary, **alignment** is worth up to 40 of your 100 primary points. It is split in two:

\`\`\`
state part  = max(0, 25 - (econ gap + social gap to the state's lean) x 1.25)
party part  = max(0, 15 - (econ gap + social gap to the party) x 0.75)
alignment   = state part + party part
\`\`\`

The *state's lean* is the state's own economic and social centre. If a state has no recorded lean, alignment falls back to a party-only score of \`max(0, 40 - (econ gap + social gap) x 2)\`. In a presidential primary alignment is also worth 40, measured against the party only, with the same 2 per point of gap.

Every version reaches **zero at a combined gap of 20 points** (for example 10 economic plus 10 social). Everything else in the primary score is favorability (up to 35, or 25 for a presidential primary) and political influence, so a candidate who is far from the party starts well behind.

### Voter appeal

In a general election each voter group has its own centre on the grid. The closer your positions are to that centre, the more appeal you get from that group. The scoring curve is gentle for small gaps and steep for large ones. It is one input beside favorability, [organization](/wiki/party-organization) and campaigning, not the only one.

### NPP reactions

An NPP legislator measures a bill's economic and social direction against its own positions. The match becomes a force of up to 100 for or against the bill, which is added to its other pressures. See [NPP Behavior](/wiki/npp-behavior).

### Moving positions

| Who | How | Cost |
| --- | --- | --- |
| Your character | Shift one axis by 1 step in your settings | 15 actions, +5 infamy, and your political influence is multiplied by 0.95. A Positions Update Voucher pays instead of all three |
| Your character | Vote on a bill with a clear direction | Moves you up to 0.25 toward the bill (Aye) or away (Nay); see [Voting & Whips](/wiki/voting-and-whips) |
| Your party | A national committee position shift proposal | 1 step on one axis, then that axis is locked for 336 turns |

### Key numbers

| Item | Value |
| --- | --- |
| Position range | -5 to +5 on each axis |
| Alignment points in a state primary | 40 (25 state lean, 15 party) |
| Alignment points if no state lean is on record | 40 (party only) |
| Combined gap where alignment reaches 0 | 20 |
| Party position shift | 1 step per passed proposal |
| Lock on a shifted axis | 336 turns |
| Character position shift | 15 actions, +5 infamy, influence x 0.95 |

### Worked example

You are at +3 economic and -1 social. Your state leans +2 and 0. Your party sits at +4 and -2.

- State part: gaps 1 + 1 = 2, so 25 - 2 x 1.25 = **22.5**
- Party part: gaps 1 + 1 = 2, so 15 - 2 x 0.75 = **13.5**
- Alignment: **36** of 40.

A rival at -2 economic and +3 social has state gaps 4 + 3 = 7 (16.25 points) and party gaps 6 + 5 = 11 (6.75 points), for **23**. That is 13 points behind, which a rival would need to make up with a lot of favorability.

## What you can do

- **Find your positions** on your character page, and the party's on its page. Compare them before you pick a party.
- **Shift your positions** one step at a time in your settings. It costs 15 actions each, so plan a few steps ahead of a primary rather than rushing.
- **Move the party.** Ask the committee to pass a position shift. It is slow on purpose.
- **Pick the party that fits.** Match the party, but also match your state's lean: that is 25 of the 40 points.

**Common questions.**
- *What happens to an incumbent when the party moves?* Their seat is unchanged. At their next primary, their alignment is scored against the party's new position, so they may lose points.
- *Which axis matters more?* Neither. They count equally in the primary and voter appeal formulas.
- *What if I do not match my party?* You lose up to 40 points of primary score, never more, and you keep every office you hold.

**Tips.** One step toward your state's lean gains 1.25 state points, but loses 0.75 party points if it also moves you away from the party. Compare that with spending the same 15 actions on favorability.

## Connections

**Driven by**

- [Political Parties](/wiki/political-parties): the charter platform sets a new party's starting position.
- [Party Leadership](/wiki/party-leadership): a passed committee proposal shifts the party one step.
- [Voting & Whips](/wiki/voting-and-whips): your votes nudge your own positions by up to 0.25.
- [Demographics & Targeting](/wiki/demographics-targeting): each voter group's own centre decides what a position earns.

**Affects**

- [NPP Behavior](/wiki/npp-behavior): an NPP's positions set how strongly it leans for or against a bill.
- [Primaries](/wiki/primaries): alignment is worth up to 40 primary points.
- [General Elections](/wiki/general-elections): voter groups reward candidates close to their centre.
- [game-starting-state](/wiki/game-starting-state): starting platforms and NPP positions are set on the ideology scale

## Status

Live in every world and country with parties, with the same -5 to +5 grid everywhere. Built-in parties start at positions calibrated to their era; custom parties start where their charter puts them.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Parties design page](https://docs.lakesidegames.net/design/parties.html).
`;
