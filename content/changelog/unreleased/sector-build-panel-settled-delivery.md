---
date: 2026-11-22
title: "Sector build panel counts only delivered facilities"
summary: >-
  The sector build queue no longer shows facilities as finished before their
  capacity has actually been delivered when a turn is running behind.
tags: [corporations, fix]
badges: [patch]
areas: [fullstack]
---

## What changed

- The "N of M finished" count on a sector's build queue now follows delivered capacity, not the build schedule.
- If a corporation turn is behind, the panel shows the last settled delivery instead of crediting facilities that are not running yet.
