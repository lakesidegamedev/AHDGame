---
date: 2026-11-08
title: Single player statistics accept reports from older versions
summary: >-
  Statistics from older single player versions are no longer rejected because
  they mention settings that have since been retired.
tags: [singleplayer]
badges: [patch]
areas: [backend]
---

## What changed

- Older single player versions still report a few game settings that this
  release removed. Their statistics used to be rejected as a whole; now the
  retired settings are simply ignored and the rest of the report is kept.
