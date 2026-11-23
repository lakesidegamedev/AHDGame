---
date: 2026-11-23
title: Regional growth keeps its production history
summary: >-
  A region's output history no longer resets when one company misses a
  production reading, so growth can settle on real production.
tags: [economy, growth]
badges: [patch]
areas: [backend]
---

## What changed

- Fixed regional output history being cleared whenever any company in the region had no production reading that turn. Growth then fell back to revenue trends, which read far too high while new companies were being founded.
