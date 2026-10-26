---
date: 2026-10-26
title: Faster bond and treasury turn phases
summary: >-
  The bond and treasury phases stop re-reading history that only grows. Bank
  bond claim lookups, unpaid coupon queues and overdue maturities now cost
  what the current turn can actually settle. No gameplay change.
tags: [performance, turn, bonds, treasury]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Looking up a bank's bond payout receipts used a pattern the database could
  not narrow, so every lookup walked the entire money journal. Each lookup now
  reads only that claim's own records.
- The treasury phase only locks the coupon payees a government can actually
  pay this turn, instead of reading every unpaid coupon ever queued. A
  government with no cash no longer holds up the others.
- A maturing government bond that its treasury still cannot fund is skipped
  cheaply until the cash is there, instead of repeating the whole settlement
  attempt every turn. Anything mid-payment is always resumed.
- A wave of maturing bonds reads its payees once for the whole wave.
