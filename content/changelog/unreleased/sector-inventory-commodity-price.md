---
date: 2026-10-18
title: Stockpiled goods are valued at their own price
summary: A sector holding an old mix of goods no longer values the whole pile at its current product's price.
tags: [corporations, sectors, inventory]
badges: [patch]
areas: [backend]
---

- When a sector sells down stockpiled goods, each commodity in the pile is now valued at its own market price.
- Previously a sector that had changed what it makes valued every leftover commodity at the price of its current product, which could show a huge profit that was never earned.
- Sectors that have never changed product see no difference.
