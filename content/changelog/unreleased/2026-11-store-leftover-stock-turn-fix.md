---
date: 2026-11-26
title: Stores with leftover stock no longer stop the turn
summary: A store still holding stock from before stores existed no longer stops the hourly turn; the leftover is cleared instead.
tags: [economy, turns]
badges: [patch]
areas: [backend]
---

## What changed

- The first turn after stores launched stopped because some former shops still held a little leftover stock from their old product. Stores sell only what households buy through them, so that leftover is now cleared at the next turn instead of stopping it.
