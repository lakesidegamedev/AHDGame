---
date: 2026-11-09
title: "Seeded region leans come from the census"
summary: >-
  Every country seed now sets a region's starting lean from its census
  electorate and no longer stores old voter-group rows.
tags: [demographics, admin]
badges: [patch]
areas: [backend]
---

## What changed

- Seeding or reseeding any country sets each region's starting political lean from its census electorate, the same figure the vote engine uses.
- A region with no census electorate is now left unfilled and reported instead of being given a neutral lean.
- New seeds no longer store the old voter-group rows on region demographics.
- Some strongly Republican US states start about one to one and a half points closer to the centre than before. No region moves more than two points.
