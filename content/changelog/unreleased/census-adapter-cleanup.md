---
date: 2026-10-19
title: Share country census conversion adapters
summary: >-
  Share identical census conversion across sixteen country models.
  Preserve country input types, era selection, fallback data, and dimension references.
tags: [cleanup, census]
badges: [patch]
areas: [backend]
---

## What changed

- Reused one census adapter across sixteen country models while retaining their typed inputs.
- Kept Nigeria's additional religion mapping unchanged.
- Kept the exact client dependency boundary guard focused on source and target pairs.
