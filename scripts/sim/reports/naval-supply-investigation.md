# Naval and air supply replay

Source: `codex/naval-supply-investigation`, based on development `154fb02bd5`.
Command: `npx tsx scripts/sim/navalSupply.ts`.
All fixtures are synthetic. No production database reads or writes.

## Balance and behavior

| Fixture                           | Previous supply | New supply | Explanation                                                                |
| --------------------------------- | --------------: | ---------: | -------------------------------------------------------------------------- |
| US, 26 destroyers, North Atlantic |             10% |        77% | North American port network: 27 berths, one hop and medium terrain         |
| UK, 26 destroyers, North Atlantic |             10% |        65% | Western European port network: 24 berths, two excess berths cost 12 supply |
| JP, 26 destroyers, East Asia      |             10% |        94% | Home port network: 27 berths, medium terrain                               |

The port multiplier is three berth units per rating point. It is an explicit game
balance assumption for strategic regional port networks, not a real-world port count.
Larger fleets still overcrowd. Multiple countries using one base share its physical
capacity; agreed guests additionally have a 75% national allowance. Enemy offshore
anchorages do not consume the defending nation's home port capacity.

With the sea/air Pacific connection, a US fighter in hostile East Asia has 43%
supply without forward basing. An accepted Chinese airbase agreement gives
94%. Offered, revoked, wrong-service and enemy agreements do not grant access.
Ground-war adjacency is unchanged. Naval operating stations remain restricted to
water/coastal strategic regions; home ports can support adjacent operating areas.

Basing actions require the country's defense officeholder or an administrator.
NPP governments have no automated offer or acceptance behavior; agreements involving
them require admin intervention. This limitation was explicitly accepted for this change.

## Correctness probes

- A fully repaired, player-stationed US wing at home saves its supply-only change
  from 10 to 100. Test database reads clone rows to avoid false persistence passes.
- Aircraft ignore naval overcrowding.
- Airlift reaches the same station and one adjacent region; destroyed wings,
  other nations and non-Airlift types do not provide it; multiple wings do not stack.
- Host offers and guest acceptance are distinct authorized actions. Either can
  revoke, outsiders cannot change access, and concurrent updates return conflicts.
- UI advice uses the same portable planner as the turn and includes the hypothetical
  move's demand. Foreign rosters are never serialized to the client.

## Cost

One added bounded active-agreement read per naval/air phase, independent of unit count.
Supply changes use the existing single bulk write. No query is added inside a unit loop.
The planner caches routes and country/domain/station base choices. A synthetic 1,000
formation roster repeated ten times took 11 ms total on this machine. This is a small
CPU probe, not a production turn-time claim. Station previews reuse equivalent
formation groups and perform no database calls in their calculation loops.

## Validation

Focused naval/air, API, UI, migration and lifecycle suites: 277 tests passed across
20 files. All 23 changed TypeScript files passed a scoped semantic check; imported
dependency bodies were not checked. Changed-file ESLint and diff whitespace checks
passed. The blocking architecture audit passed. The full architecture
contract command was attempted with a 1 GB heap and one worker; its reset-game-world
worker exited before producing assertions. A second reduced contract selection also
exited while loading seed-manifest discovery without assertion results. Neither run
is claimed as passing. Full typecheck, build and broad contract
verification remain CI gates; no larger local heap was requested.
