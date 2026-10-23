---
date: 2026-10-23
title: Obsolete sector strategies fall back to the standard recipe, not a locked future one
summary: >-
  A sector carrying a retired strategy ID used to resolve to whatever sat first
  in its catalog, which is now often a locked future recipe. Those sectors now
  fall back to the named standard recipe, so they run something they could
  actually have chosen.
tags: [corporations, strategies]
badges: [patch]
areas: [engine]
---

## What changed

- An unknown or retired strategy ID resolves to the sector's standard recipe instead of the first catalog entry.
- Valid explicit strategies, including unlocked advanced ones, resolve exactly as before.
- Unknown sector types stay inert and still report once.
- No persisted plant capacity, output units or transition state is rewritten; this is a resolution fix only.
