---
date: 2026-11-09
title: "Primary projections and admin demographics read the census only"
summary: >-
  The primary board, the per-state primary page and the admin demographic
  tools now work from the same census electorate that decides votes.
tags: [demographics, elections, admin]
badges: [patch]
areas: [backend, admin]
---

## What changed

- Primary projections no longer fall back to old voter-group rows. Every projection builds its electorate from the region census, the same way the live primary wave does.
- The admin demographics panel is down to the reseed and overwrite-defaults tools. The old voter-group table is gone.
- The debug lean report shows the cached lean next to the lean read from the census.
- The region page shows the stored lean, and the state population figure comes from the region itself.
