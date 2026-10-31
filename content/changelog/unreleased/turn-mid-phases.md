---
date: 2026-10-27
title: Shorter turns: stock exchange, primaries and action refresh
summary: >-
  Several mid-size steps of every turn now read only what they need: the stock
  exchange snapshot, primary polling, share price recompute and the per-turn
  action refresh. Results are unchanged.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

- The stock exchange snapshot reads one history row per company for each of
  its 1, 24 and 48 turn comparisons instead of the whole 48-turn window.
- Primary polling looks up this turn's snapshots with a dedicated index and
  writes every presidential race's polling history in one batch.
- Share price recompute reads only the four history fields it prices from.
- The action refresh resolves every country's Leader of the Opposition from
  one batch of reads instead of four reads per country.
