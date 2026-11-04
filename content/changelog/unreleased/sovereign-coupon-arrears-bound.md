---
date: 2026-11-05
title: "Unpaid government bond interest is kept as a few records a turn, not one per bond"
summary: >-
  When a Treasury cannot pay its bond interest, what it owes can now be
  recorded as one claim per turn for players and one for the bond market,
  funds and NPPs, instead of one claim per bond. Every holder is owed exactly
  the same amount. The setting starts off.
tags: [bonds, sovereign-debt, performance]
badges: [patch]
areas: [engine]
---

## What changed

- Each turn, every government bond's interest was recorded as its own claim, and a claim only clears when the Treasury has the cash. Heavily indebted governments rarely do, so the unpaid claims piled up: about 1.5 million of them, growing by about 31,000 a turn, and the Treasury step read the whole pile several times every turn.
- With the new `sovereignCouponGroupedAccrualEnabled` stage switched on, a Treasury records each turn's interest as one claim per currency for player holders (characters and companies) and one for the bond market, index funds and NPPs. Each holder's share is the sum of what its per-bond claims would have been, at the same exchange rate, and it is paid the same way when the Treasury has the cash.
- A one-time cleanup (`AHD-sovereign-coupon-arrears`) folds the unpaid claims already recorded into the same shape. Its read-only dry run (`scripts/ops/sovereignCouponArrearsDryRun.ts`) folds 1,516,610 open claims into 7,582 and moves no money. Claims a payment already in progress owns are left alone.
- The stage defaults to off. With it off, interest is recorded exactly as before.
