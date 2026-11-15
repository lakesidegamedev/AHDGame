---
date: 2026-11-11
title: "Nearly every game record now has a shared front door"
summary: >-
  Behind the scenes, reads and writes of bargaining, caucuses, share offers,
  regional budgets, leadership elections, reset records and about 180 other
  record types now go through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Everything behaves exactly as before. Database access for these record types now lives in one place each, and an automatic check stops new code from reaching around it.
