---
date: 2026-10-23
title: Turns process faster
summary: The hourly turn now does less database work, so it finishes sooner.
tags: [performance, turns]
badges: [patch]
areas: [engine]
---

- The turn processor now fetches the data it needs in a few larger reads instead of many small ones, and writes related records together, so a turn spends less time waiting on the database.
- Nothing about the game rules changed: the same turn still produces the same world, down to every balance.
