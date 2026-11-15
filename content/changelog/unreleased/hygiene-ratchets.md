---
date: 2026-11-09
title: Code hygiene counts can no longer grow unnoticed
summary: >-
  New developer checks stop console calls, silent empty catch blocks, lint
  suppressions, explicit any types and one-line re-export files from growing.
tags: [engineering, quality]
badges: [patch]
areas: [backend]
---

## What changed

- A new architecture check records, per file, how many console calls, empty catch
  blocks, eslint-disable comments, explicit any types and one-line re-export files
  exist today. Any file that goes above its recorded count fails the check.
- Counts can only be lowered, never raised, with `npm run hygiene:lower`.
- No game rules or player-facing pages changed.
