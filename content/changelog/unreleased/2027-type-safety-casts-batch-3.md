---
date: 2026-11-09
title: "Internal type-safety cleanup, part 3"
summary: >-
  More behind-the-scenes cleanup of country merges, settlement and military
  lookups. Nothing changes for players.
tags: [engine]
badges: [patch]
areas: [engine]
---

## What changed

- Country merge, settlement, party merge and military lookup code now reads database records with stricter internal typing instead of forced type conversions. Gameplay, numbers and results are unchanged.
