---
date: 2026-11-08
title: "Election scheduling code moved into the elections folder"
summary: >-
  The code that opens and times elections each turn now sits with the rest of the
  election code. Election dates and results are unchanged.
tags: [engine, elections]
badges: [patch]
areas: [engine]
---

## What changed

- The election scheduling modules and their tests moved into the shared elections folder.
- Old import paths still work and point at the moved files. Nothing changes for players.
