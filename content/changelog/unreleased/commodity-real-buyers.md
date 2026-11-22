---
date: 2026-11-22
title: "Commodity pages show who really buys each good"
summary: >-
  Top consumers now lists the real non-company buyers of each good, with what
  they ordered and what they received, instead of estimated formula rows.
tags: [commodities, healthcare, display]
badges: [patch]
areas: [fullstack]
---

## What changed

- Top consumers on a commodity page now lists households, government procurement, construction and investment, and economy-only countries, each with the units they ordered and the units they actually received last turn.
- The old estimated rows (Base Economic Demand, GDP-Scaled Retail Demand, Government Healthcare Budget and similar) are gone from worlds where every purchase is paid for, because no money moved through them.
- On Healthcare Services, government procurement is now shown at the amount governments actually ordered from their budgets, instead of a budget estimate hundreds of times larger.
- The new rows appear after the first turn that runs on this update.
