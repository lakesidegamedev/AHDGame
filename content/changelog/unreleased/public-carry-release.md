---
date: 2026-11-03
title: Government buying no longer arrives in one burst
summary: >-
  With staged release switched on, a government budget line that went unspent
  during a shortage spends its saved money over several turns instead of all at
  once when supply returns, so a seller's revenue no longer jumps for one turn.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, market, budget]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- When a government budget line could not buy because a good was short, part
  of the unspent money was saved for later turns, up to four turns of budget.
  The moment supply arrived the line could spend all of it at once, so a seller
  saw revenue jump several times over for a single turn and then fall back.
- Behind a new switch, off until it is turned on: a line now draws at most half
  a turn of its usual budget from those savings each turn. The rest stays in the
  public wallet for later turns, still capped at four turns of budget.
- No money is created or lost: saved budget only changes when it is spent.
