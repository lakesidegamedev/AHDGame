---
date: 2026-10-27
title: Market clearing preparation is several times faster
summary: >-
  Preparing each turn's commodity markets no longer rescans every buyer in the
  world for each state's market. Market results are unchanged.
tags: [performance, market, turn]
badges: [patch]
areas: [engine]
---

Internal supply reservations group buyers by market once per turn, and market
share and lookup tables are built with fewer intermediate copies.
