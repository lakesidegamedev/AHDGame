---
date: 2026-10-25
title: Winding-down funds no longer stall when a holder record is deleted
summary: >-
  A sponsored fund whose investor, or whose sponsor corporation, no longer
  exists now writes that position off and finishes winding down instead of
  retrying the same failed payout every turn.
tags: [funds, reliability]
badges: [patch]
areas: [backend, engine]
---

## What changed

- When a winding-down fund pays its holders, any position whose holder record
  no longer exists (a corporation, a character or another investor type) is
  treated as a zero-value write-off. The rest of the holders are paid and the
  fund can complete.
- The unclaimed cash behind a written-off position falls through to the sponsor
  residual, the same rule already used for the fund's own reserve units.
- If the sponsor corporation itself has been deleted, the fund completes and
  the audit records the residual cash as unreturned, instead of failing forever
  with the cash locked in the fund.
- Completion records each written-off holder, its units and its value in the
  fund's audit entry, so the missing payout leaves a trace.
