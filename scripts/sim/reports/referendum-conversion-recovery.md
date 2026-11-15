# Referendum conversion recovery

## Verification

The opt-in `src/lib/referendum/atomicLifecycle.mongo.test.ts` harness runs real
transactions on an owned, isolated MongoDB replica set. Run it with
`AHD_TEST_REAL_MONGO=1` and a local `mongod` on PATH. Temporary database files
must be placed on the configured work drive.

Scenarios cover:

- Recruitment slate and candidate collisions with both production unique keys.
  Filed candidates survive duplicate invitations, notes are retained, and retry
  does not duplicate planning records. Crossing party renumberings also succeed.
- An interruption after slate consolidation restores the original slates and
  candidate rows, including removal of temporary migration keys.
- A full pending-order refund rolls back with its conversion transaction and
  pays only once after a successful retry.
- Northern Ireland carries an MP's corporation from another UK region. Its
  pending construction is refunded before the headquarters and currency move.
  The synthetic owner starts with GBP 500, receives GBP 2,000 for cancelled
  capex, then holds IEP 3,750 at the fixture's 1.5 conversion rate. Existing
  operating capacity remains unchanged.
- With an intentionally mismatched UK finance watermark, NIR completes while
  SCO and WAL roll back and remain pending. Correcting the watermark lets the
  other two complete; another lifecycle call is inert.
- Banking cancellation regressions cover principal-first recovery, interrupted
  partial-refund top-ups, whole-plant credit, retained wear and parking, and
  duplicate-payment prevention.

## Production-snapshot replay

A private, uncommitted harness restored a saved turn-812 production snapshot
and its indexes into an owned local database. History dependencies omitted from
the scoped snapshot were hydrated with read-only source queries. Conversion
writes and receipt settlement were confined to the fixture; notifications were
disabled. No slate cleanup or secured-currency bypass was applied.

Once those fixture dependencies were loaded, one lifecycle call completed all
three conversions: Scotland had seven successor regions, Wales six, and Ireland
nine including Northern Ireland. Population was conserved exactly. Every
referendum completed at conversion revision 1, and an immediate second call
returned no work. The source database received no writes.

The snapshot replay verifies the migration against that captured world, not a
promise that unrelated future corrupt records cannot block a conversion. Any
such failure now rolls back only its own conversion, reports the region and
reason, and remains eligible for retry.
