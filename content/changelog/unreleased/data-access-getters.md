---
date: 2026-11-08
title: "Shared access to the busiest game records"
summary: >-
  Behind the scenes, the turn now reads and writes characters, corporations,
  regions, officials, parties, elections and budgets through one shared, typed
  entry point. Nothing changes in play.
tags: [engine, performance]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The hourly turn now reaches the ten most used kinds of game record through one shared entry point each, instead of naming them by hand in hundreds of places. Future fixes to how those records are loaded or saved can be made once.
- An automatic check stops new code from bypassing those entry points, so the number of direct reads can only go down from here.
- Gameplay, balances and turn results are unchanged.
