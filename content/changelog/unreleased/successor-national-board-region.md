---
date: 2026-11-11
title: "Scotland and Wales turns no longer stall on approval ratings"
summary: >-
  After independence, the new country's national metrics board is saved
  correctly, so approval ratings and the turn's metric refresh keep working.
tags: [politics, referendums]
badges: [patch]
areas: [backend]
---

## What changed

- A newly independent country's national board no longer carries an empty
  region marker that the approval and refresh steps rejected.
- Boards already saved that way are read correctly.
