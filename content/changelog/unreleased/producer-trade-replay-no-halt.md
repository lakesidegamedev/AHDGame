---
date: 2026-11-17
title: "Turns no longer stop on a trade bookkeeping rounding check"
summary: >-
  A rounding difference in the trade record used for import tariffs and
  automation levies stopped the turn. It is now logged and the turn continues.
tags: [economy, turns, bugfix]
badges: [patch]
areas: [engine]
---

## What changed

- The company phase replays every market fill to charge import tariffs and automation levies. A tiny rounding difference in how many seller legs the replay found halted the whole turn. The amounts were never affected, so the difference is now logged and the turn carries on.
