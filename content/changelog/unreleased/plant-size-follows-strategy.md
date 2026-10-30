---
date: 2026-10-30
title: Vehicle plants count as vehicle plants
summary: >-
  A manufacturing company that switched to building cars or trucks now owns,
  orders and sees the right number of plants. The sector page talks about
  plants, not capacity.
tags: [corporations, plants, manufacturing, vehicles]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- A manufacturing sector running Vehicle Assembly or Trucks and Heavy
  Machinery now counts its plants the same way a vehicle maker does. Before,
  it counted them like a steel works, so a factory worth 41 vehicle plants
  showed as 1 plant, and a fresh order of about 20 plants showed as
  "0 of 1 plant built".
- The build window, the construction list and your plant count now always use
  the same plant size, so the number you order is the number you see arrive.
- Switching a manufacturing sector onto or off a vehicle line recounts its
  plants for the new line straight away.
- The plant section of a sector page now shows plants: how many are running,
  how many are being built, and how many arrive each turn. The daily output
  figure moved into a tooltip on the plant count.
- Vehicle-line factories now count toward a company's total plant count (and
  anything that scales with it, such as the management cost for very large
  companies) the same way vehicle makers already did.
