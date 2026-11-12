---
date: 2026-11-09
title: "Military model, cabinet estates and infrastructure, exchange and seat rules moved out of constants"
summary: >-
  Contributor tooling only: the unit power formulas, estate and infrastructure
  lookups, exchange registry lookups and historical seat selectors now live in
  rules modules. Nothing changes in the game.
tags: [tooling, contributing]
badges: [patch]
areas: [backend]
---

The military unit model formulas, the cabinet estate and infrastructure project
lookups, the stock exchange registry lookups and the historical seat preset
selectors moved from the constants folder into portable rules modules, with the
old import paths still working. The tables stay in constants.
