---
date: 2026-11-09
title: Turns no longer stall on a federation's running arrears total
summary: >-
  A continuing state's collection of debt contributions from successor states no longer stops the turn once a successor's running arrears total gets very large.
tags: [economy, turns]
badges: [hotfix]
areas: [engine]
---

- A successor state's running arrears total added its whole unpaid balance every turn, so earlier unpaid amounts were counted again and again until the number grew too large to store and the turn failed. It now adds only what became newly unpaid that turn. Balances owed and payments are unchanged.
