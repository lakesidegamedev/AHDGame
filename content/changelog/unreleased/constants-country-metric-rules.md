---
date: 2026-11-09
title: "Country, state, metric and sector strategy rules moved out of constants"
summary: >-
  Contributor tooling only: the country config selectors, government type
  predicates, US state seat selectors, metric lookups and sector strategy
  formulas now live in rules modules. Nothing changes in the game.
tags: [tooling, contributing]
badges: [patch]
areas: [backend]
---

The country config selectors, the client-safe government type predicates, the US
state seat and electoral vote selectors, the metric catalog lookups and the sector
strategy formulas moved from the constants folder into portable rules modules, with
the old import paths still working. The tables stay in constants.
