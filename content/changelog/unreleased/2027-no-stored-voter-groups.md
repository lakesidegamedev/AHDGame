---
date: 2026-11-09
title: "Region demographics no longer carry voter-group rows"
summary: >-
  Stored region demographics hold only census weights and live drift. The
  voter-group shape now exists only as a derived view of the census electorate.
tags: [demographics, elections]
badges: [patch]
areas: [backend]
---

## What changed

- A region's saved demographics no longer have a voter-group table. The vote engines, approval weighting and region pages already read the census electorate, so nothing players see changes.
- The turn's non-player party logic loads less region data per turn.
- Election vote tallies no longer carry a voter-group catalogue they never used.
