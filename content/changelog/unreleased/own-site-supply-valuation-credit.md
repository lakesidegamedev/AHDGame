---
date: 2026-11-07
title: "A site that feeds your own other sites is now valued for the goods it hands over"
summary: >-
  Behind a new stage switch, a site whose whole output goes to your company's
  other sites is valued on those deliveries instead of at the paid cost of its
  capacity. Off by default; nothing changes until it is switched on.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- A mine, mill or plant that sells nothing because your own sites take everything it makes used to be valued at the paid cost of its capacity, while the sites it feeds got the goods free. That left it looking like a plant with no earnings in the company's share price and credit rating.
- With `fundedValuationOwnSiteCreditStage` at 1, each such site is valued as if its deliveries were worth this turn's price for that good, and the site receiving them carries the same amount against its value. Across one company the two cancel out, so a company that runs everything itself is neither better nor worse off than before.
- Valuation only: no cash moves, and the site profit and loss pages, sales figures and internal supply lines do not change.
- Companies that already book their own internal supply entries, through an internal transfer price or the market-value setting, are left as they are, so nothing is counted twice.
