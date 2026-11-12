---
date: 2026-11-08
title: Own-site market-value booking reaches companies without a transfer price
summary: >-
  The opt-in flag for booking own-site deliveries at market value was never
  set, so that booking wrote nothing for any company. Every company except one
  on Free transfer pricing now opts in.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Booking own-site deliveries at market value (the stage-3 captive market
  step) is opt-in per company plan, but no code ever set the opt-in flag, so
  the booking produced no entries for any company.
- Every company now opts in except one on Free transfer pricing, which still
  books nothing. Companies with an explicit Cost or Market transfer price keep
  their own entries as before.
- No cash moved before and none moves now; this only affects site account
  entries once the stage switch turns on.
