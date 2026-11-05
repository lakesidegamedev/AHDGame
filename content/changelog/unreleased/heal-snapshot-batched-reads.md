---
date: 2026-11-05
title: "Faster data repair backups"
summary: >-
  Data repairs that touch many documents now back them up in batches, so a
  large repair fits in the gap between turns.
tags: [operations]
badges: [patch]
areas: [engine]
---

## What changed

- The pre-repair backup reads touched documents 500 at a time instead of one at a time.
- The sovereign bond consolidation repair logs why a series was left alone.
