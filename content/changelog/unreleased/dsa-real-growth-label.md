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
- The public v1 endpoint description says the DSA scores real growth, so
  integrators can identify the input before parsing the component list. The
  published field keeps its name, so existing clients keep working.
