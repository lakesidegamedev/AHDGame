---
date: 2026-11-17
title: New plants now add capacity every turn
summary: >-
  Plants under construction now add an equal slice of capacity every turn from the next turn, instead of nothing until the build finishes or a whole plant at a time. Builds already in progress catch up to the new schedule automatically.
tags: [corporations, economy]
badges: [minor]
areas: [fullstack]
---

## What changed

- Every build order, including a single plant, delivers capacity in equal slices each turn until it finishes, so money spent on a plant starts earning right away.
- Builds already underway switch to the new schedule. Nothing already delivered is repeated and no money moves.
- The build queue and the build dialog now say capacity arrives every turn from next turn.
