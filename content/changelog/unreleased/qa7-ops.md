---
date: 2026-11-23
title: Clearer product development targets and supply agreement prices
summary: >-
  Product development forms now show each line's target, and supply agreement forms state which price they settle against.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, supply agreements]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend, backend]
---

## What changed
- Product development shows the target each spend level is measured against, what revenue it is based on, and each level's spend as a share of the target. The form now says that every line uses the same quality curve, so lines that lift the same plants show the same numbers.
- The supply agreement form names the billed input price that contracts settle against, shows the market price from the commodities table next to it, and shows the slider range in money. The two prices differ because the billed price follows the market in a damped, bounded way.
- Supply agreement volumes and commitments are shown per day everywhere, and the damage ceiling is explained in plain words.
