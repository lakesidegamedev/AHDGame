---
date: 2026-10-19
title: Clarify NPP autonomy level documentation
summary: >-
  Code comments for the v5 and v6 NPP autonomy levels now describe how each
  level is enabled instead of implying v6 is inactive.
tags: [docs, npp]
badges: [patch]
areas: [backend]
---

## What changed

- Describe v6 as active wherever a world selects it and point to the per-turn
  `nppEngineVersion` stamp.
- Drop the outdated beta label on v5.
