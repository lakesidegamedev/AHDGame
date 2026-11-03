---
date: 2026-11-03
title: Choose prices for supplies sent to your own sites
summary: >-
  CEOs can choose free, quoted production-cost, or discounted market-price
  accounting for goods delivered between their own sites. Matching site charges
  and income leave company cash unchanged, and appear in sector accounts.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, production, internal-supply]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack, engine]
---

## What changed

- Added an internal transfer-price selector in Internal supply settings. Free remains the default.
- At-cost uses the supplier's break-even production quote; market-price uses the posted ask and the existing selectable discount.
- Recorded matching income and charges per site while preserving company cash, total producer profit, physical deliveries, and external quotes.
- Displayed the allocations separately in sector accounts and excluded internal income from the outside-sale price average.
