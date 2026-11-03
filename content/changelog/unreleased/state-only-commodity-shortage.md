---
date: 2026-11-03
title: Local services say which states are short
summary: >-
  Healthcare, real estate, construction and freight sell only inside each
  state, so their world shortage could not tell you where a plant would find
  buyers. The commodities list now says how many states are actually short.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, corporations, market]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- Healthcare, real estate, construction and freight are sold only to buyers in
  the state where they are produced. Their world supply and demand add every
  state together, so a good could read deeply short worldwide while the state
  you built in was already fully supplied, and the new plant found few buyers.
- On the market's commodities list, the Balance column for these four now reads
  "Short in N of M states", or "Supplied in every state", with a note that they
  sell only inside each state. Other goods keep their world balance.
- The new plant and build capacity screens already measure these goods against
  the plant's own state; this brings the market list in line with them.
- No game rules changed.
