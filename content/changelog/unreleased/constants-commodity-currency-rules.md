---
date: 2026-11-09
title: "Commodity and currency rules moved out of constants"
summary: >-
  Contributor tooling only: the commodity market formulas and the exchange
  rate lookups now live in rules modules. Nothing changes in the game.
tags: [tooling, contributing]
badges: [patch]
areas: [backend]
---

The commodity price and flow formulas and the starting exchange rate lookups
moved from the constants folder into portable rules modules, with the old
import paths still working. The tables stay in constants. The random currency
regime roll stays beside the tables because it uses a random number.
