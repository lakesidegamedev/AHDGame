---
date: 2026-11-12
title: "Slow corporation turns can now be explained from the turn log"
summary: >-
  The turn log now breaks the producer market step into its planning passes,
  the sites still changing in each pass, the final clearing and the receipt
  encoding. Nothing in the game changes.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- Each producer planning pass is timed and counted separately in the turn log.
- The log records how many sites were still changing after each pass.
- Final clearing, receipt encoding and the claim step are timed on their own.
- No game result changes; this only adds diagnostics.
