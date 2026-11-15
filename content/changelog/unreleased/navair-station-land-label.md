---
date: 2026-11-10
title: "Naval and air command explains why a region cannot host a fleet"
summary: >-
  The Station list now says a region is a land region instead of calling it
  "no port" when it has a port rating.
tags: [military, interface]
badges: [patch]
areas: [fullstack]
---

## What changed

- On the Naval and air command page, a region typed as land now reads "land region, fleets cannot be stationed here" in a fleet's Station list. Before, it read "no port" even when the region had a port rating.
- Regions with no port at all now read "landlocked, no port".
- Which regions a fleet can be stationed in has not changed.
