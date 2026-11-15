---
date: 2026-11-09
title: "Corporation, command economy and tech tree rules moved out of constants"
summary: >-
  Contributor tooling only: the corporation margin and growth formulas, the
  command economy formulas and the tech tree selectors now live in rules
  modules. Nothing changes in the game.
tags: [tooling, contributing]
badges: [patch]
areas: [backend]
---

The corporation margin, dominance and growth formulas, the command economy
marketization formulas and the tech tree read helpers moved from the constants
folder into portable rules modules, with the old import paths still working.
The tables and tuning constants stay in constants.
