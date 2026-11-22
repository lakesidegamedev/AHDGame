---
date: 2026-11-22
title: Below-market pricing stops at your own cost
summary: >-
  A plant set to sell below the market now cuts its price down to its own cost
  per unit and no further, so a big seller can no longer drag a market price
  down by a fifth every turn.
tags: [market, corporations]
badges: [patch]
areas: [engine]
---

- A plant on an automatic price set below the market used to ask that much
  less than whatever buyers paid last turn. When that plant sold most of the
  market, its own price became last turn's price, so it cut again from there
  and the price kept falling every turn with no bottom.
- A below-market price now goes down to the plant's own cost per unit, but not
  below it. If the market price is already under that cost, the plant asks the
  market price instead of cutting further.
- Plants on the normal or above-market setting, and plants with a manual or
  cost-plus price, are not affected.
