---
date: 2026-10-19
title: Reuse the election country scope helper
summary: >-
  Reuse the shared country filter in state and committee elections and the admin batch route.
  Preserve unscoped queries, legacy US records, and country isolation.
tags: [cleanup, elections]
badges: [patch]
areas: [backend]
---

## What changed

- Removed three duplicate optional-country scope helpers in favor of the existing shared helper.
