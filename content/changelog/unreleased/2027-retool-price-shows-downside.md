---
date: 2026-11-11
title: "The switch price includes a method's downside charge and build time"
summary: >-
  The strategy picker now quotes the full price of switching to a late-game
  method and says how long the old method keeps running while it is built.
tags: [corporations, research]
badges: [patch]
areas: [frontend, backend]
---

Switching to a late-game method adds a one-off downside charge to the retooling
fee. The confirm box and the strategy list now include that charge in the price
they show, name the downside, and say how many turns your current method keeps
running while the new one is built. Before, the box showed only the retooling
fee, so the bill could be much larger than the quote.
