---
date: 2026-11-15
title: "Clearer tracking of why actions fail"
summary: >-
  When an action is refused, the game now records which rule refused it, so we
  can spot the walls new players hit most often.
tags: [analytics]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- Refused actions now carry a short reason, such as not enough action points, not enough funds, or the turn being processed.
- Only for players who accepted optional analytics. Error messages, names and amounts are still never recorded.
