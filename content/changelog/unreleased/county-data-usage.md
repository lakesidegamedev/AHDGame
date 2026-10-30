---
date: 2026-10-30
title: County populations persist and follow demographic changes
summary: >-
  US counties now have saved populations that follow births, deaths and migration,
  with exact state totals. County population baselines and primary field-office maps are corrected.
tags: [population, counties, elections]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Corrected county population baselines using a consistent Census source.
- Saved county populations now share each state's demographic changes proportionally and sum exactly to state totals.
- Election maps and new field offices read saved county populations.
- Fixed county IDs missing from field-office reads used by primary maps.
