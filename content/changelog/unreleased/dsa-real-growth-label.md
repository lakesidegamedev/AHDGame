---
date: 2026-11-18
title: The debt sustainability score names its growth input as real
summary: >-
  The sovereign watch and its public endpoint now call the DSA growth reading
  real GDP growth, so a burst of inflation cannot be mistaken for an improving
  credit score.
tags: [world, economy]
badges: [patch]
areas: [frontend, backend]
---

- The growth component of the debt sustainability index is labeled Real GDP
  growth in the sovereign watch payload, the per-country sovereign status
  payload and the public v1 sovereigns response.
- The input documentation states that the figure excludes inflation, because the
  score reads output and a nominal reading would reward a price spike.
- The public v1 sovereigns response publishes the figure as
  `realGdpGrowthPct`, in percent with inflation excluded. `annualGdpGrowth`
  remains as a deprecated alias carrying the same value, so existing clients
  keep working while new ones can read the unit and basis from the field name.
- The public v1 endpoint description spells out the real-growth basis and the
  alias, so integrators can identify both without parsing the DSA component
  list.
