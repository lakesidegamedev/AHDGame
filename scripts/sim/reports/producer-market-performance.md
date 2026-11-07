# Routed producer market performance

Baseline: `4f9dba212d` (development, 2026-11-07). Issue-first waived by the user.

The bounded synthetic harness is `scripts/sim/producerMarketPerformance.ts`.
Run it with the baseline worktree as its first argument. The baseline rules and
receipt encoder were extracted from that exact commit for this qualification.
No live database, player data or full-world replay is used.

## Same-state allocation

100, 200 and 400 buyers trade against 50, 100 and 200 suppliers across US, UK
and JP. Each case has eight price levels, shared corporate cash, shared spending
limits and a directional US-to-JP embargo. The harness compares every account,
order, supplier outcome, receipt, price and country-book row with the baseline
using exact deep equality. It separately expands the receipt and checks that
no blocked cross-border trade occurred. All three cases passed.

One observed run, in milliseconds (wall-clock diagnostics, not production forecasts):

| Buyers | Baseline clearing | Candidate clearing | Baseline encoding | Candidate encoding |
| -----: | ----------------: | -----------------: | ----------------: | -----------------: |
|    100 |             16.92 |              13.10 |              4.59 |              10.38 |
|    200 |             27.35 |              26.05 |             10.57 |              15.96 |
|    400 |             46.90 |              39.64 |             26.79 |              29.59 |

Small receipts can cost slightly more to encode because nested values are now
visited and the complete dependency manifest is recorded. The optimization
targets repeated large supplier lists, not every small market.

## Receipt fan-out

3,000 orders share 400 supplier IDs, reproducing repeated route lists at a
bounded scale:

| Measurement                            |   Baseline | Candidate |
| -------------------------------------- | ---------: | --------: |
| Unique receipt JSON bytes              | 43,300,797 |   427,593 |
| Stored payload bytes, including base64 |    697,640 |    13,664 |
| Immutable chunk upserts                |         42 |         2 |
| Encoding milliseconds                  |     180.56 |      3.85 |

JSON storage falls 99.0%; stored payload falls 98.0%. Writes remain batched;
chunk counts are not Mongo round-trip counts. Staging and decoding each retain
one batched chunk query with bounded cursor batches. Nested dependencies are
listed up front, so decoding does not issue a query per supplier or per depth.
The harness does not measure live Mongo command latency or a whole phase.

The run used one logical CPU, BelowNormal priority and a 512 MB V8 heap ceiling.
Reported lifetime peak RSS was 242,712 KB (about 237 MiB).

## Deadline and compatibility

The existing 30-second planning budget remains separate from a new cooperative
180-second pre-settlement execution budget. Checks run inside market clearing,
receipt encoding and staged-chunk verification. Expiry fails before claiming
the receipt or moving market cash. Immutable staged chunks may remain if expiry
happens after staging. Already claimed receipts retain their normal idempotent
settlement/recovery path. An in-flight database command is not forcibly killed.

Version-2 receipts store nested arrays by content hash and restore shared
arrays once. The decoder still reads the legacy flat format; no historical
receipt migration is required. An older binary cannot read version-2 receipts,
so deployment rollback must retain the compatible decoder.

Unit/integration coverage checks nested round trips, shared arrays, missing and
corrupt chunks, legacy reads, deadline expiry without money/plant mutations,
and deadline checks during final clearing. Existing market tests cover own-site,
local freight, market-first, reservation, accounting and embargo behavior.

## Verification and limits

- Final producer-market run: 695 tests in 67 files passed, one worker.
- Architecture contract scripts: 27 tests in six files passed.
- Architecture audit: zero blocking findings (existing migration warnings remain).
- Changed TypeScript lint and Prettier passed; receipt-storage TypeScript check passed.
- Broader typechecking exceeded the enforced 1 GB heap ceiling. A combined reset
  contract run lost its worker loading `resetGameWorld.test.ts` at the memory cap;
  it is not counted as passing. Full typecheck/reset verification remains for CI.
- Production build was not run locally. Semgrep is not installed in the local Python environment.
- No full-world timing prediction, production writes, deployment or live turn replay
  is claimed. Future turn logs now separate preparation, clearing, close,
  validation, encoding, receipt staging and publication to verify the actual gain.
