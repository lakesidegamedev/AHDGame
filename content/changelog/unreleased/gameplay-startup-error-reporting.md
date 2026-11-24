---
date: 2026-11-24
title: "Gameplay pages have less startup work"
summary: >-
  Gameplay pages can draw and become responsive before loading the full
  browser error reporter. Errors that occur during startup are still reported.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Gameplay pages load the browser error reporter on interaction, navigation,
  or an error. It also starts after 30 seconds in a visible tab.
- An error during startup is saved and sent once reporting is ready.
