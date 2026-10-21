---
date: 2026-10-21
title: The undercutting limit counts the whole corporate group
summary: >-
  A firm that sells more than half of a commodity's world supply cannot cut
  prices below the market. That limit now adds up every corporation in a
  group, so selling through subsidiaries no longer avoids it. Switched on
  separately.
tags: [economy, corporations, balance]
badges: [minor]
areas: [engine]
---

## What changed

- Units sold are summed across a corporation's control group before the half-of-supply check.
- Every member of a group above the line has its price cuts floored at the market price. Raising prices is unchanged.
