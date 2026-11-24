---
date: 2026-11-24
title: "Faster photos and lighter company pages"
summary: >-
  The Senate, House and Illinois photos use smaller WebP files and start
  downloading sooner. Company pages load some management tools when their tabs open.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The game serves the chamber and Illinois photos directly and prioritizes the main
  photo as the page opens. Both keep their existing crop and space.
- The company structure and CEO Office tools load on demand,
  with space reserved for the controls during loading.
