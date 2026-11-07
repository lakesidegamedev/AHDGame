# Corporation timeout and recovery qualification

## Failure and change

The read-only investigation of turns 731 through 740 found two timed-out
corporation phases whose producer market receipts eventually settled. The phase
runtime drained the still-running callback but discarded its return value. The
downstream line-of-credit phase then had no income map. A separate older crash
resume had skipped interrupted corporation work entirely; the existing resume
guard already blocks that path.

The runtime now applies its late-success recovery to corporation results as well
as bonds. A bounded snapshot preserves the four summary totals, warnings,
internal income and per-currency income. Income Maps serialize as entry arrays
and decode as Maps. Completion and its result are persisted together. Unknown,
non-finite, negative or duplicate income entries are rejected, as are incomplete
or oversized snapshots. No absent income is assumed to be zero.

A retryable `TurnMustStopError` from market preparation still stops for retry;
its identity and retryable marker survive a timeout drain. Other corporation
errors stop with repair evidence preserved. Subsequent phase starts on that
runtime are blocked. A completed legacy corporation phase without a stored
result also refuses resume, and the repair command refuses to manufacture a
completion result from evidence that writes occurred.

## Upstream reconciliation

Development through `757a2369a7` was fast-forwarded into this worktree. It includes
the restricted-buyer-only route lists (#5736), supplier reach reuse (#5739), and
per-stage timing diagnostics (#5735). The reconciliation retains local
route-class cohort reuse, receipt compaction and batched decoding, cooperative
execution checks, and the upstream timing diagnostics.

The 30-second planning limit remains a convergence fallback; hitting it can
still produce a warning. The local 180-second pre-settlement execution deadline
stops expensive work cooperatively before claiming a new receipt. Neither is a
guarantee that every world converges or every database operation finishes within
that interval. Already-claimed journaled settlements retain their retry path.

## Checks

Tests cover successful late corporate completion feeding downstream income,
retryable and non-retryable failure, blocked downstream work, crash-resume
serialization, USD/GBP/JPY income, malformed income, missing legacy snapshots,
and refusal of unsafe completion repair. Existing market tests exercise fair
allocation, embargoes, deadlines, receipt recovery and cash/physical invariants.

The bounded market replay compares all allocations, balances, prices and country
flows at 100, 200 and 400 buyers with the pre-optimization baseline. It also
checks embargoed trades and repeated-route receipt size. This is synthetic
qualification, not a live-sized whole-turn replay or a deployment claim.

All local checks use one pinned CPU at BelowNormal priority and a heap ceiling
of 768 MiB for tests, 512 MiB for the replay and lint. Full-project typecheck and
production build remain outside the completed local verification due to the
previous memory-limit failures. No production data is changed or repaired by
these code changes.

## Verified results

- 799 tests passed across 72 market, host-phase, runtime, resume and operator
  repair test files after upstream reconciliation.
- 32 architecture contract, bootstrap index and turn-read projection tests passed.
- Architecture audit: zero blocking findings, 71 existing warnings.
- Final banking, NPC maintenance, index installer and index-fund checks: 85 tests
  passed after the test-wrapper cleanup. No additional correctness finding was
  identified during the final audit.
- Changed-file ESLint, Prettier and `git diff --check` passed.
- The 100/200/400-buyer replay matched the baseline exactly for allocations,
  cash, prices and country flows. Embargo checks passed.
- In the repeated-route fixture (3,000 orders, 400 suppliers), encoded JSON
  decreased from 43,300,797 to 427,593 bytes and compressed chunks from 697,640
  to 13,664 bytes. Encoding took 186.48 ms versus 4.03 ms in this local run;
  smaller fixtures were not uniformly faster. Peak replay RSS was 251,712 KiB
  (about 246 MiB). These measurements do not predict production turn latency.

Deployment must upgrade receipt readers together: new code reads legacy
receipts, but old releases cannot decode the new nested version-2 format. Do
not roll a worker back to an older reader while it owns a new-format in-flight
receipt. The existing-world banking index installer remains a separate,
explicit deployment step; it has not been run against production.
