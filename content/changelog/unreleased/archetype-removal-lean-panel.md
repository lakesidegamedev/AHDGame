---
date: 2026-11-09
title: "Lean map breakdown shows census groups in every country"
summary: >-
  Clicking a region on the lean map now lists its census groups (age, income,
  region of origin and so on) with their share, turnout and lean, in every
  country instead of only the United States.
tags: [map, demographics]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- The lean breakdown under the map reads the same census groups the vote counts, so it now works for every country and uses that country's own group names.
- Regions without a census show the usual "no demographic data" message.
