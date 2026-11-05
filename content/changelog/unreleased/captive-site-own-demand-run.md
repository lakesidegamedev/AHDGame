---
date: 2026-11-05
title: Sites that supply their own company now plan for that company's needs
summary: >-
  A site whose output goes to its own company's other sites now plans its run
  from what those sites need, instead of repeating last turn's tiny run while
  the company buys the rest on the market.
tags: [economy, corporations, production]
badges: [patch]
areas: [backend]
---

## What changed

- A site that made a sliver of its capacity and sent all of it to its own
  company's sites used to plan the same sliver again every turn. Meanwhile the
  company kept buying the rest of that good on the open market.
- Now the site plans at least enough to cover its own company's demand for the
  good, counting what the company's sites asked for in total, whether it was
  filled by the site or bought on the market. It ramps up to that level the next
  turn.
- The run is still capped at the site's capacity, and short inputs or cash still
  cut it when it settles.
- When a company has several sites making the same good, the demand is shared
  between them by capacity.
- Sites with no demand from their own company, and companies that buy on the
  market before their own supply, plan exactly as before.
