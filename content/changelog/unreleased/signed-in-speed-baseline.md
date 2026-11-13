---
date: 2026-11-13
title: "Speed baseline for signed-in pages"
summary: >-
  Page speed checks now log in properly and record how fast gameplay pages load
  on a phone, with a target for each page.
tags: [engineering]
badges: [patch]
areas: [frontend]
---

## What changed

- The signed-in speed check keeps its login, so gameplay pages are measured instead of the login page.
- Each gameplay page has a speed target, and the first phone measurements are recorded.
