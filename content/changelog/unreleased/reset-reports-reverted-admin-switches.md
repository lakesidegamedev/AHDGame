---
date: 2026-11-12
title: "World reset now lists the admin switches it reverted"
summary: >-
  A world reset puts the fresh-world switch settings back. The reset result and
  log now name every admin switch whose value changed, with the value before
  and after, so an operator can restore the ones that should stay.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The reset result carries a list of switches that changed across the reset, covering the game state switches and the fresh-world game config flags.
- The reset log prints the same list on one line.
- Which switches survive a reset is unchanged.
