---
date: 2026-11-08
title: "Government debt walls stay small"
summary: >-
  When many government bonds mature on the same turn, they are now always
  refinanced into one shared bond per country, coupon and turn, even in a world
  that never stored the setting. Debt, interest and holder balances are unchanged.
tags: [economy, bonds]
badges: [patch]
areas: [engine]
---

## What changed

- Refinancing matured government bonds no longer multiplies the number of bonds. Each maturity turn adds at most one replacement bond per country and coupon, so the next maturity turn settles quickly instead of growing every cycle.
- A shared rollover bond next to a normally scheduled bond of the same coupon and turn is no longer reported as a split series.
- Debt, interest owed and what each holder is paid are unchanged.
