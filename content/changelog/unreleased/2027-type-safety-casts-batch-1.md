---
date: 2026-11-08
title: "Internal type-safety cleanup"
summary: >-
  Behind-the-scenes cleanup of how turn processing reads data. Nothing changes
  for players.
tags: [engine]
badges: [patch]
areas: [engine]
---

## What changed

- Some turn and corporation code now reads data with stricter internal typing instead of forced type conversions. Gameplay, numbers and results are unchanged.
