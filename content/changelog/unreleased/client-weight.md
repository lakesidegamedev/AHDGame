---
date: 2026-11-07
title: "Lighter pages for region conditions, corporations and campaigns"
summary: >-
  Several pages no longer download server-side game data they never use, so
  they load less code in your browser. Nothing you see or do changes.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The region conditions card no longer download every country's region and census data just to list and sort approval effects.
- The corporation strength charts in the wiki and the corporation strength forecast no longer download the full technology tree.
- The canvassing panel no longer downloads the United States era voter tables to list the voter groups.
- On character creation, the name lists for every country are now loaded the first time you press Randomize instead of with the page.
- A new automatic check stops these heavy server modules from being pulled back into pages by accident.
