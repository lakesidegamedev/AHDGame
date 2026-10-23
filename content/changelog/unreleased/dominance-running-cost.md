---
date: 2026-10-21
title: Holding a market now has a running cost that fades as your share falls
summary: >-
  A group that holds most of a market pays a margin cost every turn, not only
  when it builds. The cost counts the whole corporate group, shrinks as the
  group's share falls toward the threshold, and shows on the sector page as
  the Market dominance row. Switched on separately.
tags: [economy, corporations, balance]
badges: [minor]
areas: [engine, fullstack]
---

## What changed

- A group's share of a market is the sum of its members' shares there. Above half of a local market, or 30 percent of a nation's, the group pays a margin penalty that grows with share.
- The cost falls away smoothly as share falls back to the threshold. A group at the threshold pays nothing.
- Your tech shield still reduces it. State-owned corporations stay exempt.
- The sector page shows the penalty the turn actually applied.
