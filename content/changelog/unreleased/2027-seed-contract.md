---
date: 2026-11-08
title: "New worlds only start from data written for their start date"
summary: >-
  Starting a new world now checks that every piece of opening data was written
  for that start date. If anything is missing, copied from another start date
  or out of scale for that era's economy, the world does not start and the
  admin sees the full list. Running worlds are unchanged.
tags: [world, reset, seeds]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A new world no longer quietly fills a gap with another start date's data. Before anything is reset, the game checks every start date's regions, budgets, exchange rates, alignments, election dates and seat rosters, and stops with one list of everything that needs writing.
- Budgets and regional totals are also checked against the start date's own economy: spending and debt as a share of GDP, costs per person against income, regional totals against the national figures, currencies that were in use at the time, and prices against the era's price level.
- The 2027 world has its own opening alignments for every nation, reflecting changes since 2023 such as Finland and Sweden in NATO and Syria after the fall of its government.
- Brazil's five regions in the 2027 world have their own 2027 population and economy figures.
- Austria, Greece, Finland and Ukraine now name their politicians from their own name lists.
- Some start dates cannot be started until their missing data is written. Worlds that are already running, including the live world, keep playing exactly as before.
