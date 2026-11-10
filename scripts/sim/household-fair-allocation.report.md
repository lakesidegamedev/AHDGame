# Household allocation qualification

2026-11-09. Run `npx tsx scripts/sim/household-fair-allocation.ts`.
An optional `--snapshot <private file>` replays a captured commodity book. Private
receipts, accounts and route lists are not checked into the repository.

## Change

Household orders now opt into the existing fair-share matcher by default.
Previously, equal-priority household demand cleared in account-id order, which
embedded country codes. Scarce supply could be exhausted before later countries
were reached, even when those households had cash and eligible affordable offers.
The government-only fair-share stage did not mark these orders.

The same builder creates flat baskets, price ladders and post-wage regenerated
orders. Substitution orders preserve the flag. Fairness remains proportional to
outstanding quantities at each eligible price, not equal amounts per country.
Existing supplier route lists, priority, shared budgets, price ceilings and
embargo filtering remain in force. No home-country-first preference is added.

An explicit low-level `fairShare: false` exists only for historical replay. The
production shell does not set it. The historical spillover financial digest is
preserved by replaying its original allocation policy rather than replacing its
expected digest.

## Deterministic checks

- All 26 country IDs in the ordered registry plus independent Scotland/Wales
  (deduplicated) receive 30 units when each requests 100 and supply is 30% of demand.
- Repeat with 1, 8 and 32 wallets per country: 26, 208 and 832 orders. Aggregated
  country allocations do not change. Reversing order input also leaves results unchanged.
- US/UK/JP demand of 100/200/300 shares 30 units as 5/10/15. Splitting the US
  request among ten wallets does not increase its aggregate share.
- In the constrained-route case, US can buy only the western supplier, UK can
  buy western/eastern supply, and JP has an empty permitted-supplier list. Fills
  are 10/30/0. Every reconstructed trade is checked against buyer eligibility.
- Cash conservation, no overdrafts, price ceilings, per-order and price-ladder
  spending caps, reserved priority, substitution and post-wage rebuilding are tested.

## Captured turn 781 network book

The controlled replay uses 218 household orders and 403 frozen Network Services
offers. It isolates their basket budgets and does not rerun the whole corporation
turn, production, taxes, wages or other commodity markets. Thus these are allocation
results, not a forecast of the next live turn.

| Buyer country | Original delivery, units/day | Fair delivery, units/day |
| ------------- | ---------------------------: | -----------------------: |
| US            |                            0 |                27,702.52 |
| UK            |                            0 |                   685.40 |
| JP            |                    14,519.08 |                14,859.95 |

Total settled network volume is unchanged: 2,429.523485775878 settlement units
before and 2,429.523485775877 after (floating-point rounding only). Cash is
conserved and every reconstructed supplier leg remains eligible.

## Cost and validation

One process, one CPU affinity, below-normal priority, 1.5 GB Node heap cap. A
single isolated clearing measured about 12.0 ms before and 9.0 ms after on the
captured book. Synthetic 26/208/832-order cases measured 1.8/3.2/5.0 ms before
and 1.7/2.1/25.5 ms after. These small local timings are noisy, and are not a
full-turn or production runtime guarantee; large fair groups can cost more.

No database reads, queries or collection writes are added to the turn path.
The marker rides on existing receipt orders. For the captured network-order
array, JSON size changes from 1,527,592 to 1,531,298 bytes; gzip level-1 size
changes from 93,549 to 94,677 bytes. These are array-only serialization
measurements, not a full database round-trip profile.

The complete producer-market directory passes: 69 files, 747 tests, including
settlement integration. No live data was changed by the investigation or replay.

Scoped TypeScript checking, touched-file ESLint and the architecture audit pass.
The broader lifecycle/reset contract run could not complete: its worker exited
unexpectedly during module loading under both the 1.5 GB and 2 GB heap caps.
No contract assertion result was obtained; the resource caps were not raised.

Audit verification also passes all 812 affected market, route, sizing and modal tests
across 76 files, including fairness and embargo checks for all 16 household commodities.
