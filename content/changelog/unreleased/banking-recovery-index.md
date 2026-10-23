---
date: 2026-10-23
title: Banking recovery no longer scans the money journal every turn
summary: >-
  The banking phase's recovery check used to read every completed money
  movement to find unfinished ones. A partial index makes it a direct lookup,
  removing roughly a minute from each turn. No gameplay change.
tags: [performance, turn, banking]
badges: [patch]
areas: [engine, backend]
---

## What changed

- New partial index `bankMoneyMoves_unprojected_applied` covers applied money
  moves whose projections have not completed. The banking recovery queue,
  read at the start of every banking phase, now resolves through it instead of
  fetching every applied move. On a copy of the live journal the query went
  from about 27 seconds to 12 milliseconds.
- The index is created at startup on existing worlds and by the seed on fresh
  ones. Building it on a 6.5 GB journal took about 9 seconds.
- The banking phase now reports `resume` and `recovery` as separate substeps
  on the turn log, where they were previously one combined entry.
