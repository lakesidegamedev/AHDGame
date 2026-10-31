---
date: 2026-10-28
title: Database inspection tool accepts id and date filters
summary: >-
  The read-only remediation query, count and distinct commands now understand
  Extended JSON ids and dates, so lookups by document id work. No gameplay
  change.
tags: [maintenance, tooling]
badges: [patch]
areas: [backend]
---

## What changed

- `query`, `count` and `distinct` in the remediation CLI revive `{"$oid": ...}`
  into an ObjectId and `{"$date": ...}` into a Date before the filter reaches
  Mongo, including inside `$in` lists. Before, Mongo rejected them as an unknown
  operator or with "cannot nest $ under $in", so an id lookup could not be
  written at all.
- Write paths (ad-hoc repairs and compensation) are unchanged.
