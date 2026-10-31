---
date: 2026-10-30
title: Restore the lore and seed reference exporters
summary: >-
  The lore corpus and seed reference exporters are back, so exported lore and
  seed reference data stay in step with the game.
tags: [tooling, lore]
badges: [patch]
areas: [backend]
---

## What changed

- Restored `scripts/exportLoreCorpus.ts` and `scripts/exportSeedAuditReference.ts`, removed by an unreferenced-script cleanup.
- Added `export:lore-corpus` and `export:seed-audit-reference` package scripts so the exporters have an in-repo reference.
