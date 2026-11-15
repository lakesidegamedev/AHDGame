---
date: 2026-11-15
title: Actions page and market chart no longer crash
summary: >-
  The Actions page no longer errors for players in Canada and other newer
  countries while it loads, and the market chart no longer breaks on a turn
  with no recorded price.
tags: [actions, campaigns, market, stability]
badges: [patch]
areas: [frontend]
---

## What changed

- The Actions page waits for the live national GDP figure before pricing
  campaign, advertise and donor-base actions for countries that have no
  era baseline row (Canada and the other countries added in 1.20). Before,
  the page could throw on first load and show an error instead of the cards.
- The market chart draws a turn with a missing price as a gap instead of
  crashing the chart. The moving-average and comparison lines skip missing
  prices the same way.
- Browser error reporting no longer records offline blips, interrupted page
  streams, analytics timeouts and third-party script errors that players
  cannot act on and the game cannot fix.
