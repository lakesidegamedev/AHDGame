---
date: 2026-11-23
title: "Region, map and crisis pages load faster"
summary: >-
  Region pages send far less data to your browser, and the map and crisis pages wait on less.
tags: [performance, regions, map, crises]
badges: [patch]
areas: [fullstack]
---

## What changed

- Region pages no longer ship every player's full profile to your browser. Only the name, portrait, party, office and influence shown in the list are sent, which makes busy regions much lighter.
- The country map loads its data with fewer database trips, so the map appears sooner.
- Crisis pages load their affected regions and detail panels at the same time instead of one after the other.
