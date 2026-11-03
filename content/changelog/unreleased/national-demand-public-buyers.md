---
date: 2026-11-03
title: "National demand can count government and investment orders"
summary: >-
  Behind a new stage switch, a country's national demand includes the orders its
  government and investment buyers place, not only orders from buyers placed in a
  state. Off by default; nothing changes until it is switched on.
tags: [economy, commodities, producer-market]
badges: [patch]
areas: [engine]
---

## What changed

- Government and investment buyers order from national accounts that have no state. Their orders reached the world total but never a country's national demand.
- With `producerNationalPublicDemandStage` at 1, those orders count in their own country's national supply and demand. State figures and the world total are unchanged.
- Everything that reads national demand then sees them: the national price, the national part of the sector margin, latent shortage and where NPPs found plants for goods that trade across borders (defence, manufacturing, technology).
- On the latest turn the biggest changes are ordnance (United States 513 to about 60,000 a day, from a deep surplus to 59% short), building materials, steel, electronics, software and construction services.
