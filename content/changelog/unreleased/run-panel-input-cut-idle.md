---
date: 2026-11-09
title: "Run panel no longer blames a small input shortage for large idle capacity"
summary: >-
  The sector run panel now credits short inputs only with the output they
  actually cut from the plant's own target, instead of the whole gap to capacity.
tags: [corporations, fix]
badges: [patch]
areas: [backend]
---

## What changed

- When a plant that already runs well below capacity is also held back by one
  short input, the Inputs note counts only the output that input removed.
- The rest of the gap to capacity stays with its real causes, such as staffing.
