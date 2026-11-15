---
date: 2026-11-09
title: "Approval weighting uses the census electorate"
summary: >-
  How strongly each issue counts toward a region's government approval now
  follows the region's census groups, in every country.
tags: [approval, demographics]
badges: [patch]
areas: [backend]
---

## What changed

- Region and national approval weight each issue by the leanings of the region's census groups at the current in-game year, rather than a stored voter-group table.
- A region with no census data keeps the plain, unweighted average.
- Missing census data is only tolerated for background countries. A playable or NPP-run country with a region that has no census now fails loudly instead of silently dropping the weighting.
