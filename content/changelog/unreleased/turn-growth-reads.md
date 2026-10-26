---
date: 2026-10-26
title: Turn phases stop slowing down as history grows
summary: >-
  Bond pools, credit-line garnishment and bond history now read and write once
  per turn instead of once per pool or borrower, and three new indexes keep
  turn lookups proportional to live bonds and unfinished payments. No gameplay
  change.
tags: [performance, turn, bonds, credit]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Credit-line garnishment of bond income reads every borrower's settlement
  record in one query instead of one per borrower.
- Each bond pool's money-supply and maturing-debt reads are batched for all
  pools at once.
- Bond history snapshots are written in a single unordered insert.
- New indexes keep unfinished-payment lookups and bond maturity and issuance
  windows from scanning every record ever written.
- A test now fails if a database lookup uses a pattern the database cannot
  narrow by index, the cause of the slow bank claim lookups fixed earlier.
