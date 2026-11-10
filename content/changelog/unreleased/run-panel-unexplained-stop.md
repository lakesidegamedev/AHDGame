---
date: 2026-11-10
title: "Sector run panel no longer blames inputs for a stop it cannot explain"
summary: >-
  When a sector stops short of capacity and the records show no input or cash
  cut, the idle-capacity breakdown now lists the gap under other limits.
tags: [corporations, display]
badges: [patch]
areas: [frontend]
---

## What changed

- The idle-capacity breakdown on a sector page no longer labels an unexplained stop as short of inputs.
- That part of the gap now appears under Other limits.
- Stops with a recorded input or cash cut are shown as before. Production itself is unchanged.
