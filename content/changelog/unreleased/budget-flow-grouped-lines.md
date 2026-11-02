---
date: 2026-11-02
title: See what the Other lines in a national budget are made of
summary: >-
  Open Other Spending on a national budget to see every law it pays for, with
  its cost, and the general spending not tied to any law. Other Revenue now
  says what it holds, and the grey bars on the fiscal flow chart list the lines
  folded into them.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [budget, economy, ui]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend]
---

## What changed

- Opening Other Spending in the Income and Expenses panel now lists what it is
  made of: each law paid for from it, largest first, with its yearly cost and
  share of the line, then the general spending the budget books without a law.
  The rows add up to the line.
- Laws with no spending category were counted in Other Spending but never
  listed under it. They now are.
- Opening Other Revenue says what it holds: fees, fines, asset income and
  profit from state-owned companies that do not pay into a named revenue line.
  The game stores these as one amount, so they are shown together.
- On the fiscal flow chart, the grey bars that fold in the smallest lines are
  now called "Smaller sources" and "Smaller outlays" with a count, so they no
  longer look like the real Other lines. Tap one to list the lines inside it.
- Suggested by a player (suggestion 405).
