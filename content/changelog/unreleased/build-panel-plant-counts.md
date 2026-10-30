---
date: 2026-10-30
title: Build orders show their real number of plants
summary: Vehicle factories and entertainment media sectors now count each build order at their own plant size.
badges: [patch]
areas: [frontend]
tags: [corporations, capacity]
---

The build queue in a sector now sizes every order by the plant the sector actually runs. A vehicle factory makes one plant per unit of capacity, so an order for 63 units of vehicle capacity reads as 63 plants; entertainment media sectors count at their own plant size too. Only the figures on the page change. The capacity ordered, the delivery over time and the money paid are all unaffected.
