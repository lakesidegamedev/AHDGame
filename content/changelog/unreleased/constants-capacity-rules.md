---
date: 2026-11-08
title: "Capacity economy rules moved out of constants"
summary: >-
  Contributor tooling only: the capacity pricing and build cost formulas now
  live in a rules module, and a new check stops constants from gaining
  functions. Nothing changes in the game.
tags: [tooling, contributing]
badges: [patch]
areas: [backend]
---

The capacity economy formulas moved from the constants folder into a portable
rules module, with the old import path still working. A new architecture check
keeps functions from being added to constants and lets the count only fall.
