---
date: 2026-10-23
title: Turn performance is now measured in documents written
summary: >-
  The turn log now records how many documents each phase writes, not just how
  many Mongo commands it issues. System money legs also stop being mirrored
  into a second audit collection. No gameplay change.
tags: [performance, turn, observability]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Every phase on the turn log now carries `writeCommands`,
  `documentsWritten` and, for phases that write at least 100 documents,
  `topWriteCollections`. The profiler report printed at the end of a turn
  includes the same numbers.
- Write volume is counted from the server reply, not from the command that was
  sent: an update that matches but changes nothing is not counted, and an
  upsert is.
- A `financialTxLog` row is mirrored into `actionAuditLog` only for
  player/NPP/admin actions and the system rows the anomaly detectors read
  (related supply-agreement settlements and party funding). Routine system
  settlement legs now live only in `financialTxLog`, which was already the
  authoritative money trail.
- `AUDIT_MIRROR_SYSTEM_MONEY=1` restores the old full mirror without a code
  change if a forensic investigation needs it.

No balance, price, rate or RNG stream changed. The only behavioural difference
is fewer duplicate audit rows for money that the game itself moved.
