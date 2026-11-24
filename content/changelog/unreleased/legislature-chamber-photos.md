---
date: 2026-11-24
title: "US legislature and company pages load less up front"
summary: >-
  The Senate and House photos use smaller WebP files and start downloading
  sooner. Company pages load some management tools when their tabs open.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The game serves the chamber photos directly and prioritizes the selected
  photo as the page opens. Both keep their existing crop and space.
- The company structure and CEO Office tools load on demand,
  with space reserved for the controls during loading.
