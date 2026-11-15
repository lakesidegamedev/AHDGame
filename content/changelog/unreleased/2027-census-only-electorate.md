---
date: 2026-11-09
title: "Elections count census groups only"
summary: >-
  Every election and primary now counts votes from each region's census groups.
  The old stored voter-group fallback is gone.
tags: [elections, demographics, engine]
badges: [patch]
areas: [backend, engine]
---

## What changed

- General elections, presidential races and primaries all take their electorate and turnout from the region's census groups. A region with no census data now stops the count with a clear error instead of quietly using an older voter-group table.
- Primary projections and the primary state page use the same census groups as the live wave, so the board matches what the count produces.
- Nationwide ad bonuses that were spread over the old voter groups are removed with them.
