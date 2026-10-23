---
date: 2026-10-23
title: A winding-down fund now finishes instead of stalling on leftover orders
summary: >-
  An index fund in wind-down refused to complete while it had a resting order or
  a queued subscription, and nothing ever cleared them, so holders were never
  paid. Wind-up now cancels those orders and refunds those subscriptions before
  it closes the fund.
tags: [index-funds, wind-up]
badges: [patch]
areas: [backend]
---

## What changed

- Wind-up cancels the fund's open share orders and returns their unspent escrow to the fund.
- Queued subscriptions are refunded to the investor through the same path a player cancel uses.
- Only then are queued withdrawals paid and the fund delisted, so the turn warning stops instead of repeating.
