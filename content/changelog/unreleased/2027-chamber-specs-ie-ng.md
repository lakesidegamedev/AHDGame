---
date: 2026-11-08
title: "Ireland and Nigeria elections run from a shared description"
summary: >-
  Election scheduling for Ireland and Nigeria now comes from the same
  chamber description the newer countries use. Election dates, seat counts and
  regions are unchanged.
tags: [engine, elections, countries]
badges: [patch]
areas: [engine]
---

## What changed

- Ireland's Dáil, President and local councils, and Nigeria's House, Senate, governors, State Houses of Assembly and President, are now described as data: seats, cycle, voting system and region source. One shared spawner runs them.
- Snapshot tests for every era start (1953 to 2027) confirm the same elections, dates and seats as before.
- A new check stops the number of country-code branches outside the country folders from growing.
