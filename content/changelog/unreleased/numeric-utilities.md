---
date: 2026-10-18
title: Share identical numeric utilities
summary: >-
  Matching numeric helpers now share portable implementations while preserving
  their existing bounds, fallback, and rounding behavior.
tags: [maintenance, numeric-utilities]
badges: [patch]
areas: [engine]
---

## What changed

- Shared matching clamps and four-decimal rounding helpers across existing systems.
- Preserved distinct reversed-bound priorities and non-finite input handling.
