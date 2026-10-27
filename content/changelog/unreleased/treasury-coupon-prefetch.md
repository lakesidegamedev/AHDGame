---
date: 2026-10-27
title: Treasury checks every government's coupon queue in one pass
summary: >-
  The treasury phase reads every government's coupon queue up front instead
  of asking separately for each one, and skips governments that cannot pay
  anything this turn. No gameplay change.
tags: [performance, turn, treasury, bonds]
badges: [patch]
areas: [engine]
---

## What changed

- The treasury reads what each government owes in one pass at the start of
  the phase. A government with too little cash to pay any coupon this turn
  no longer goes through the full settlement steps; its new coupons are still
  recorded.
