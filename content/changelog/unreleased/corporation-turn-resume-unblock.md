---
date: 2026-11-12
title: "An interrupted company turn can resume when its journal covers it"
summary: >-
  Behind the turn resilience switch, which is off, an interrupted company turn
  now reruns from its journal instead of stopping for a manual repair. Nothing
  changes for players while the switch is off.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- With the switch on, a company turn interrupted partway reruns when its journal proves what was already written.
- A fresh start of a turn number clears old journal rows for that number.
- With the switch off, an interrupted company turn still stops for repair.
