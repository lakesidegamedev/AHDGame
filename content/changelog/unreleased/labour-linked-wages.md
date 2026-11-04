---
date: 2026-11-04
title: Wages can follow the local job market
summary: >-
  Behind a new switch, off until it is turned on, plant wages rise where
  workers are scarce and ease where jobs are scarce, a few points a turn, and
  each country's wage growth, and so its inflation, follows its job market.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, labour, inflation, corporations]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Behind a new switch, off until it is turned on, the share of a plant's value
  added that goes to wages depends on unemployment in its state instead of one
  fixed figure. Where unemployment is at or below 4.5%, plants aim for 55% of
  value added; at 12% or more they aim for 30%; in between the aim moves
  smoothly.
- Wages are sticky. A plant's wage share moves at most 3 points of value added
  a turn, so a jump in unemployment, or turning the switch on, walks wages to
  their new level over several turns.
- The same limits as before still apply: the raise never takes more than a set
  share of what the plant had left last turn, and wages never fall below the
  normal payroll.
- With the switch on, each country's wage growth, which feeds inflation and the
  income tax base, comes from its states' job markets: tight markets add growth,
  slack ones take it away, and wages that are still rising or falling add a
  capped amount on top. Countries without national figures no longer sit on a
  flat 3% wage growth.
