---
date: 2026-11-08
title: "A banned party officer no longer blocks the seat"
summary: >-
  A banned chair, vice-chair or treasurer now counts as an empty seat for
  approvals, payout allowances and party elections, so the party can refill it.
tags: [parties, fixes]
badges: [patch]
areas: [backend]
---

## What changed

- A banned party officer no longer counts toward the two-officer approval rule or the higher payout allowance.
- Treasury approvals no longer get stuck waiting on a banned officer. With the seat empty, the chair or vice-chair covers it as they do for any vacant treasurer seat.
- The party page and the server now agree on how many officers are seated.
- Party election pages no longer list a banned player as the current office holder.
