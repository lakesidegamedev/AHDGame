---
date: 2026-11-23
title: "Build advice and company decisions count only real demand"
summary: >-
  Expansion suggestions, region pages, computer-run companies, state companies and the market-dominance
  charge no longer count demand that was never an actual order.
tags: [corporations, economy]
badges: [patch]
areas: [fullstack]
---

## What changed

- Expansion suggestions and region pages count only real demand when they show how much room a market has. Large phantom gaps in goods such as food are gone.
- Computer-run companies and state companies judge demand and prices by real orders when they decide what to build and how much to produce.
- The market-dominance charge reads demand as recorded, with no extra demand added back. A company's share is measured against real buyers only.
