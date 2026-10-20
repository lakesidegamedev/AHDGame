---
date: 2026-10-21
title: The monopoly nationalization trigger counts the whole corporate group
summary: >-
  The 75 percent market share that makes a corporation a monopoly target now
  adds up the shares of every corporation in a group, so holding a market
  through several subsidiaries no longer keeps it under the line. Switched on
  separately.
tags: [economy, corporations, nationalization]
badges: [minor]
areas: [engine]
---

## What changed

- A group's share of a market is the sum of its members' shares in that market. The group's highest market is checked against the 75 percent threshold.
- Every member of the group is treated as a monopoly target when the group crosses it.
- The cure check on a pending taking uses the same group figure.
