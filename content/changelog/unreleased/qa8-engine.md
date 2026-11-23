---
date: 2026-11-23
title: "Outside sales show who bought them, and tech prices respect the input cap"
summary: >-
  A plant's sales breakdown now lists its own buyers instead of the whole market's, and research prices no longer count input savings the cap would throw away.
tags: [corporations, technology]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- The "Who bought" list on a sector output now shows your own plant's customers: households, government procurement, construction and investment, economy-only countries, the wider economy and other companies. It says which view it is showing. Plants with no recorded buyers yet keep the market-wide list until their next turn.
- Research price and payback now count only the part of an input reduction that fits under the 30% cap. A node that is partly over the cap is cheaper, and a node fully over the cap has no value.
