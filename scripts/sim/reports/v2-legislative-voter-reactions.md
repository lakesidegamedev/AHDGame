# V2 legislative vote qualification

Run: `npx tsx scripts/sim/v2LegislativeVoterReactions.ts`.
Fixture: synthetic, deterministic, no player data or database writes.

| Country | Policy transitions | Reacting transitions | Buckets | Ideology checks | Maximum cell approval change per family |
| ------- | -----------------: | -------------------: | ------: | --------------: | --------------------------------------: |
| US      |              1,300 |                1,040 |      15 |          35,100 |                                       4 |
| UK      |              1,300 |                1,040 |      18 |          35,100 |                                       4 |
| JP      |              1,300 |                1,040 |      13 |          35,100 |                                       4 |
| IE      |              1,300 |                1,040 |      17 |          35,100 |                                       4 |
| SCO     |              1,300 |                1,040 |      18 |          35,100 |                                       4 |
| WAL     |              1,300 |                1,040 |      18 |          35,100 |                                       4 |

All 52 families and all 25 before/after ideological combinations are checked.
The 260 unchanged-choice transitions per country intentionally produce no reaction.
Nine voter positions and three ballots per transition verify the 0.25-per-axis
ideology movement cap, position bounds, abstention neutrality and repeat clicks.
Approval endpoint differences reverse exactly and telescope through intermediate
choices, including after rounding. There is no destination-extremeness multiplier.

The sum of dimension maxima bounds a single demographic cell, accounting for
its overlapping age, education, income and other identities. One family's full
left-to-right change is bounded by 4 approval points (2 effective favorability).
Three maximum changes are bounded by 12 approval points (6 favorability). A
one-rung change is much smaller. These bounds concern ideological law families;
continuous taxes are calibrated in percentage points separately.

## Spot checks

- UK coverage Center to Center-left: senior bucket +0.18, low income +0.10,
  high income -0.04. The previously examined synthetic young, low-income,
  degree-educated urban white British cell receives +0.80 approval, or +0.40
  effective favorability, compared with +19 favorability in the initial draft.
- JP targeted household relief: low-income +0.30, middle-income +0.15,
  high-income -0.15. This replaces the inherited zero/positive-high-income result.
- Reproductive law uses a separate social-preference profile, without inferred
  ethnicity or income preferences. General health coverage retains healthcare
  preferences. Childcare emphasizes working-age groups rather than seniors.
- Readiness funding is treated as an economic spending/procurement choice rather
  than interpreting every increase in public readiness spending as less hawkish.

## Corporate tax

242 exact-rate transitions cover both income vocabularies, including fractional
rates, no-ops, reversals and intermediate steps. A cut from 30% to 20% yields:

| For voter bucket     | Approval change | Effective favorability contribution |
| -------------------- | --------------: | ----------------------------------: |
| Low income/wealth    |           -1.00 |                               -0.50 |
| Middle income/wealth |           -0.80 |                               -0.40 |
| High income/wealth   |           +1.20 |                               +0.60 |

An increase reverses these signs; Against receives the opposite reaction.
Changes are calculated from the current legislated rate, including an already
scheduled phase-in target, rather than a stale proposal snapshot or nearest
policy option. Re-enacting the same target gives no reward and does not advance
its phase-in. Later routine phase-in steps do not repeat the legislative reward.
Domestic and foreign corporate taxes use the same rules nationally and, where
supported by the existing tax system, regionally. Other tax types retain their
existing behavior. Bill-detail previews use these shared rules as well; corporate
previews read the current rate/target and suppress legacy option-index reactions.
This adds one projected budget read per corporate-tax provision on the bill read
path, not to per-voter turn processing.

## Persistence and cost evidence

Existing approvals, personal ideology ledgers and world-scoped law-enactment
receipts are reused. Tax receipts use a distinct bill/type key and empty program
ids so mixed law/tax bills cannot collide. No new collection or schema field is
introduced. The existing receipt collection is cleared on a world reset.

Law-family enactment adds zero reads and at most two bulk writes per bill,
regardless of voter count. Corporate tax enactment adds three projected reads
(receipt, current budget and world identity), a receipt insert and at most two
bulk approval writes per provision, plus transaction control, around the existing
tax-rate calculation/write. No query is issued per voter. Missing/uninitialized
budgets award nothing. The existing session-bound DB helper serializes nested
reads and keeps tax writes, approval writes and receipts in one transaction.

Tests cover both countries' income vocabularies across US/UK/JP/IE/SCO/WAL,
For/Against characters and NPPs, abstention, current-law changes, retries, pending
targets, missing budgets and write failures. Mock session tests do not establish
real replica-set rollback during a Mongo outage or whole-world turn performance.
No production balances, votes, approvals or tax rates were modified.

## Decay precision qualification

The running approval balance keeps full floating-point precision. Both turn
decay and new legislative credits preserve fractions. The decay rate remains
0.5% per turn and the existing 0.01 zero threshold is unchanged. Existing stuck
balances start decaying on subsequent turns without a migration or backfill.

| Initial magnitude | After 1 turn | After 48 turns | After 139 turns | Cleared at turn |
| ----------------- | -----------: | -------------: | --------------: | --------------: |
| 0.02              |       0.0199 |      0.0157231 |               0 |             139 |
| 0.18              |       0.1791 |      0.1415078 |       0.0896769 |             577 |
| 0.80              |       0.7960 |      0.6289236 |       0.3985641 |             875 |
| 1.20              |       1.1940 |      0.9433853 |       0.5978462 |             956 |
| 10.00             |       9.9500 |      7.8615445 |       4.9820516 |           1,379 |
| 100.00            |      99.5000 |     78.6154448 |      49.8205163 |           1,838 |

These values are rounded only for this report. The same 2,000-turn replay
verifies negative balances have the opposite sign, that every nonzero step
shrinks, and that every case reaches zero. The former rounded implementation
stalled at +0.18, +0.80 and approximately +/-1.

The turn host retains its two reads and at most two batched writes. Both reads
now project only approval balances and _id, reducing unnecessary document
materialization. Shell tests check persistence for characters and NPPs across
all six v2 countries, including no-op zero balances. No per-player query or new
persisted field is introduced. More previously stuck balances will now be
written each turn as intended; this is not a whole-world performance benchmark.

## Audit concurrency checks

Decay writes compare the approval snapshot before replacing it. A credit arriving
between the read and write is preserved; that actor resumes decay on the next
turn. Counts reflect actual modified documents, not attempted writes. This does
not add a per-player query or retry loop. The corporate-tax writer also receives
the resolved bill country, so old metadata missing countryScope cannot write a
US budget while calculating another country's voter reactions.

## Final audit verification (2026-11-04)

With the branch's locked dependencies installed, the affected legislative and
decay suites passed 693 tests (22 intentionally skipped). The reset and
architecture contracts passed 185 tests. Full ESLint passed with no errors;
changed-file TypeScript checking passed for 33 files. The architecture audit
reported zero blocking findings and 68 warnings. The deterministic simulation
above passed again after the audit fixes.

Local verification was deliberately resource-limited: one test/build worker,
two assigned CPU threads, a 3 GB Node heap, and a 4 GB aggregate build watchdog.
The complete local test run was stopped at the heap limit; bounded shards
exposed an incomplete dependency install, which was repaired with npm ci.
The full TypeScript check exhausted its 3 GB heap, and the production build was
stopped by the aggregate memory watchdog during compilation. These are not
passing full-suite or build results. Full tests, full typecheck, production build
and Semgrep still require CI qualification before merge.
