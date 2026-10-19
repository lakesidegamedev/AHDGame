---
date: 2026-10-19
title: Reduce error and loading entrypoint boilerplate
summary: >-
  Share the error-boundary prop contract and identical redirect loading skeletons.
  Keep route-specific error handling, navigation, logging, and loading entrypoints unchanged.
tags: [cleanup, errors, loading]
badges: [patch]
areas: [frontend]
---

## What changed

- Reused one typed error prop contract across forty-three route error components.
- Shared the redirect skeleton across six loading entrypoints while preserving their route files.
