---
date: 2026-11-24
title: "Less code to load when opening the game"
summary: >-
  The game loads the navigation style you use and keeps its space reserved
  while it loads. The Market uses a smaller set of country and offer code.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Exchange names and availability come from the country data already loaded
  by the game shell.
- Supply offer controls and rows load with the tab that displays them.
