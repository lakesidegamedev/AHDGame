---
date: 2026-11-09
title: "Map lean reads the census electorate"
summary: >-
  When a region has no stored political lean, the map now works it out from the
  region's census groups instead of an older stored voter-group table.
tags: [map, demographics]
badges: [patch]
areas: [backend]
---

## What changed

- The map's lean colours use a region's stored lean when there is one, and otherwise the lean of its census electorate at the current in-game year.
- A region with neither a stored lean nor census data now reports an error instead of showing as neutral.
