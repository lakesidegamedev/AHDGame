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
- The market-dominance charge on new builds is measured against real buyers, and it now applies only when a company's capacity would exceed what its market buys. A sole provider in a market that is short pays the normal build price; building past demand costs up to 10x at twice demand.
