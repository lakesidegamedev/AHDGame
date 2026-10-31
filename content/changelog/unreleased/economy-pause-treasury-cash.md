---
date: 2026-10-28
title: Economy pause no longer stops the turn at the treasury cash step
summary: >-
  During a timed economy pause the treasury cash step now skips with the bond step it depends on,
  so the rest of the turn (politics, elections, legislation) runs.
tags: [turns, economy]
badges: [patch]
areas: [backend]
---

## What changed

- The turn runtime can say whether a phase is excluded by the turn's phase predicate.
- When bondTurn is excluded (timed economy pause or a sim profile), resetTreasuryCash is recorded as skipped instead of failing the turn for a missing bond result. A bond turn that was allowed to run but produced no result still fails as before.
