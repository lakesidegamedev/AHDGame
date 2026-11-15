---
date: 2026-11-08
title: "Background country economy fixes"
summary: >-
  In a 2027 world, shocks now cut a background country's tax base and national
  index as well as its market supply, national index funds stay fully backed
  when you buy while they reprice, and foreign policy decisions are no longer
  lost when they fail to take effect.
tags: [world, countries, economy, funds]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A shock or a stability loss in a background country now reduces its GDP, tax revenue and national index, matching the cut to what its market supplies.
- Buying a national index fund while it is being repriced can no longer leave it with less cash than it owes. If the price moves under you, the purchase is refused with a request to try again.
- A background country's decision to join a war, or to change a tariff, is now confirmed only after it has taken effect. If that step fails it is retried on the next update instead of being recorded as done.
- Worlds started from any other date, and the live world, behave exactly as before.
