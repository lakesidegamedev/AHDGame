---
date: 2026-11-02
title: See what is inside the grey bars on the budget flow chart
summary: >-
  The fiscal flow chart on a national budget folds its smallest lines into one
  grey bar on each side. Those bars are now named "Smaller sources" and
  "Smaller outlays" with a count, and tapping one lists every line inside it.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [budget, economy, ui]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend]
---

## What changed

- The chart keeps the five biggest revenue lines and the six biggest spending
  lines and folds the rest into one bar per side. Those bars were called "Other
  revenue" and "Other outlays", which sat next to real budget lines such as
  "Other Revenue" and could not be told apart. They are now "Smaller sources"
  and "Smaller outlays", with the number of lines they hold.
- Tap, click, or press Enter on one of those bars to list each line inside it
  with its amount. Tap it again to close the list. Hovering on a desktop shows
  the same list.
- Real budget lines called "Other" are a single modelled amount and cannot be
  split further; the Income and Expenses panels below the chart describe what
  each one covers.
- Suggested by a player (suggestion 405).
