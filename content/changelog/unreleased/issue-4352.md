---
date: 2026-10-23
title: Cost-plus quotes no longer spiral when a plant runs a fraction of its capacity
summary: >-
  Cost-plus pricing spread a full plant's fixed bills over whatever it actually
  made, so a throttled plant charged more per unit, sold less, and was throttled
  again. Fixed cost is now spread over no less than the 10 percent run the
  throttle keeps, which bounds the quote.
tags: [corporations, pricing]
badges: [patch]
areas: [engine]
---

## What changed

- A cost-plus plant's fixed cost per unit is capped at what the demand throttle's 10 percent floor would charge.
- Input cost still scales with the recipe, so only the fixed share was bounded.
- Plants running at or above the floor record the same basis as before.
