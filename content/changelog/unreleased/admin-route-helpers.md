---
date: 2026-10-17
title: Share admin route authentication and error handling
summary: >-
  Admin endpoints share their repeated authentication and error handling while
  retaining existing validation, responses, and database operations.
tags: [cleanup, api, admin]
badges: [patch]
areas: [backend]
---

## What changed

- Reuse one authentication and error-handling wrapper across 96 handlers in 70
  admin routes with existing integration coverage.
- Preserve custom error handlers and routes with a different authentication order.
