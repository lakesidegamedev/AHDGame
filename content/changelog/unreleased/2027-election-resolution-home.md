---
date: 2026-11-08
title: "Election resolution code moved into the elections folder"
summary: >-
  The code that counts votes, seats winners and runs by-elections and snap
  elections now sits with the rest of the election code. Results are unchanged.
tags: [engine, elections]
badges: [patch]
areas: [engine]
---

## What changed

- The election resolution modules and their tests moved into the shared elections folder.
- Old import paths still work and point at the moved files. Nothing changes for players.
