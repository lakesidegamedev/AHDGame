---
date: 2026-10-18
title: Verify cleanup merge compatibility
summary: >-
  Integrated current development changes, aligned simulation watchdog tests
  with supported platforms, and hardened remediation turn-lock checks.
tags: [maintenance, compatibility, testing]
badges: [patch]
areas: [backend]
---

## What changed

- Kept POSIX watchdog tests on supported platforms and verified Windows rejection explicitly.
- Added invalid-timeout coverage for every platform during the cleanup merge audit.
- Refuse remediation when the canonical game-state document is absent, even if a stray row is marked active.
