# Producer receipt and preparation optimization qualification

## Scope and method

Baseline: `1b831284c0`. Candidate: the receipt-storage and preparation changes in this worktree.
Both arms restore the same privately retained post-turn-744 checkpoint and execute the complete
turn-745 corporation phase, including database settlement, corporate taxes, salaries, dividends,
index-fund payments and personal withholding. No production writes or outbound HTTP calls occur.
Raw snapshots, logs and comparison artifacts remain ignored under `tmp/`; they contain private
world state and must not be committed.

Both arms use Windows, one CPU at BelowNormal priority, a 1280 MiB V8 heap limit and a
512 MiB WiredTiger cache. Runs are sequential. The measured corporation timeout was 300 seconds. A subsequent failsafe change raises it to a fixed 360 seconds; these replay measurements predate that timeout-only adjustment.
For controlled economic equivalence, the harness temporarily fixes both arms at 11 planning
passes and allows enough planning time to complete that work. Production's 64-pass ceiling
and 30-second planning budget are restored unchanged. Neither controlled arm fully converges:
both report the same 677 changing sites and perform the same final clearing.

## Measurements

| Scope                                    | Baseline seconds | Candidate seconds | Reduction |
| ---------------------------------------- | ---------------: | ----------------: | --------: |
| Full corporation phase                   |          144.412 |           117.450 |     18.7% |
| Funded producer market                   |           91.520 |            67.287 |     26.5% |
| Receipt encoding                         |            8.276 |             6.686 |     19.2% |
| Receipt staging / read-back verification |           11.296 |             1.351 |     88.0% |
| Funded work outside market publish       |            6.504 |             6.017 |      7.5% |

Rows are nested and must not be added together. The full phase improves 18.7% in this matched
pair; this does not establish a 25-30% whole-turn improvement or guarantee production latency.
Untouched clearing loops also ran faster, so the entire wall-clock difference cannot be
attributed solely to the changed code. The strongest mechanical improvement is eliminating
redundant receipt inflation/checksumming and reducing cursor batches.

- Whole-phase profiler commands: 4,902 to 4,868. The phase runtime's narrower counters are
  4,897 to 4,863; heartbeat/finalization accounting differs between those instruments.
- Receipt-chunk commands: 45 to 13, with the same 672 returned chunk documents and
  28,894,516 returned BSON bytes. Larger batches save 32 commands; other command differences
  include fewer heartbeat writes during the shorter phase.
- Whole-phase returned BSON: 248,140,621 to 248,128,474 bytes.
- Encoded receipt bytes: 29,226,096 in both arms. Unique chunks expand to 632,843,411 JSON bytes.
- Peak Node RSS: 1,491,128 to 1,473,464 KiB, excluding MongoDB and the parent harness.
- The existing 4,500-command phase budget remains exceeded; it was not raised to pass this work.

Earlier 256 MiB-cache trials ranged from 130 to 323 seconds and included minute-long indexed
supply-agreement/payment updates and socket timeouts outside the changed market code. Those
trials are diagnostic, not accepted before/after performance evidence. The final pair uses the
same larger, still bounded cache in both arms. Local wall clock remains noisy.

## Economic equivalence

Verified from the two closing local databases:

- Complete stored market receipt and its content-addressed chunk manifest match after removing
  only the receipt's wall-clock creation timestamp. This covers requests, route restrictions,
  orders, allocations, prices, inventory, capacity and market cash flows.
- Corporation cash, share prices, shares, shareholders and payables match exactly.
- Character and NPP money balances and all 482 producer-wallet cash records match exactly.
- Captured sector capital, build, inventory, settlement and PnL records match after excluding generated document/build IDs and build
  creation/update timestamps. Stable location/type/owner fields and economic values are retained.
- Financial transaction counts and amounts match by type, including 1,376 corporate-tax payments,
  52 corporate dividends, 8,537 index-fund dividends, 13 corporate salaries and 22 personal-income
  withholding records. There are 41 player income recipients in both arms.
- Both arms contain 16,527 ledger entries for the turn, with zero entries flagged unbalanced.
  This is not an independent proof that every legacy accounting path conserves money.
- Both arms process 1,574 corporations and 8,932 sectors and finish the market as settled.
- Existing merger-review Treasury paired-source errors and construction-loan dissolution guards
  are unchanged and remain separate work.

## Implementation safeguards

The offer index and eligibility cache live for one preparation, retain original seller ordering,
and distinguish an unrestricted route from an empty allowed-supplier list. Home access and
embargo checks remain the same. Era prices are shared only within preparation; regional ratios
and site conditions still apply separately.

Receipt serialization retains the original chunk boundaries, JSON hashes, gzip level and v2
format. Plain string lists use native array serialization only when bounded. Deadline checks
remain at bounded traversal intervals and around compression. Staging still reads persisted
payloads back: exact bytes from a privately recorded fresh encoding establish integrity directly;
old, reconstructed or mutated chunks still require decompression and SHA-256 verification.
Recovery decoding continues to verify all chunk hashes.

## Validation

- 749 tests across 71 files pass: the complete producer-market test directory, physical
  preparation, producer demand, and turn-path fat-collection read projections.
- Focused TypeScript checking passes for all four changed runtime modules and their import
  graph, using the repository's existing ambient declaration for westminster-svg.
- ESLint passes for all seven changed TypeScript source/test files.
- Architecture audit passes with zero blocking findings (71 repository warnings).
- All 185 lifecycle/reset/index contract tests pass.
- Subsequent audit: repository-wide TypeScript checking exceeded an explicitly bounded 3 GiB
  heap. Focused checking passes; the full type gate remains for CI rather than raising local usage.
- A sandboxed CI-suite attempt encountered local HTTP launcher timeouts and was stopped. The
  same 19 launcher tests pass with loopback access enabled. The full-suite gate is not claimed
  from that interrupted attempt. A production build remains deferred to CI.
- No deployment or production mutation occurs during qualification.
