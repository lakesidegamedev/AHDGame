---
date: 2026-10-30
title: Faster fund rebalancing for non-player investors
summary: >-
  The every-fourth-turn pass where non-player investors trim overweight index
  fund holdings now saves all of its changes at once instead of one at a time.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

Non-player investors redeem exactly the same units from exactly the same funds
as before. Only the way the turn records those redemptions changed, which
shortens the turns that run this pass.
