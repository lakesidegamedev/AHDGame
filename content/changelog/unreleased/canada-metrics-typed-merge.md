---
date: 2026-11-11
title: Canada's regional statistics build without an unchecked type cast, with no player-visible change
summary: >-
  The code that combines Canada's national baseline with each province's own
  figures now checks its data shape instead of forcing it. Every province's
  numbers are unchanged.
tags: [maintenance, canada]
badges: [patch]
areas: [engine]
---

## What changed

- Canada's provincial statistics are built from a copy of the baseline with a
  shape check on each override, so a wrong override key is skipped instead of
  being hidden by a forced type.
- All 13 provinces and territories produce exactly the same figures as before.
