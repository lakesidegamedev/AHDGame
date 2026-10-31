---
date: 2026-10-26
title: Leaner codebase
summary: >-
  About 60,000 lines of unreferenced scripts, modules and their tests are
  gone. No gameplay change.
tags: [maintenance]
badges: [patch]
areas: [backend]
---

## What changed

- 295 one-off scripts that nothing runs any more (debug probes, finished
  backfills and old simulation reports) were removed.
- 67 source modules that no page, API route, turn phase or script reaches
  were removed along with their tests.
