---
date: 2026-11-03
title: The sector page says why output did not sell
summary: >-
  When part of a plant's output goes unsold, the sector page now says why:
  your price was above what buyers paid, buyers at your price were shared with
  other sellers, every buyer was already supplied, or nobody bought at all.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, market]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- The sector page showed how much of an output sold and nothing else, so a CEO
  could not tell a price problem from a demand problem.
- Under "What goes in, what comes out", any output that went partly unsold last
  turn now gets one sentence naming the cause, from what the plants asked
  against what buyers in that market actually paid: a price above the market,
  buyers shared with other sellers at the same price, every buyer at that price
  already supplied, or no trade in that market at all.
- The figures add up every plant in the sector, not one plant's row.
- The company commodity table now says that net production is added up across
  every site and does not mean your own plants received it.
