---
date: 2026-11-23
title: Steadier maps, share quotes and shareholder names
summary: >-
  The share price change on a corporation page now follows each new turn, and
  shareholders carry a number so look-alike names can be told apart.
tags: [corporations, maps, stock-market]
badges: [patch]
areas: [frontend]
---

## What changed

- The share price change shown under a corporation's price now reloads when a
  new turn arrives, so it no longer stays on the previous turn's figure while
  the price moves.
- The bottom bar's share price panel shows the last settled turn it compares
  against.
- Each shareholder row shows a stable number, or a short reference for
  non-player holders, so two holders with similar names are never mixed up.
- If the world map or a region map fails to load, the failure is now recorded
  with the address that failed, and a map request that never answers gives up
  and offers Try again instead of waiting forever.
