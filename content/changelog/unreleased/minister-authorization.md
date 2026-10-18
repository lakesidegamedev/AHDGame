---
date: 2026-10-18
title: Share minister authorization resolution
summary: >-
  Diplomatic and trade actions now share their minister authorization lookup
  while preserving seated-minister authority, head-of-government fallback, and trade admin overrides.
tags: [maintenance, authorization]
badges: [patch]
areas: [backend]
---

## What changed

- Consolidated matching cabinet-holder and head-of-government resolution behind the existing named guards.
- Preserved permission differences, database acquisition order, and forbidden responses.
