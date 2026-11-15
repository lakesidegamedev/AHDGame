---
date: 2026-11-15
title: Fix structured data rendering
summary: >-
  Prevent a script rendering warning when opening pages while preserving
  the structured data used by search engines.
tags: [structured data, page layout]
badges: [patch]
areas: [frontend]
---

## What changed

- Render JSON-LD as a native data script instead of an executable Next.js script.
- Escape HTML opening brackets in the serialized structured data.
