---
date: 2026-11-17
title: Faster merges reach players
summary: >-
  Fixes and updates reach the live game several minutes sooner, because
  already-tested changes are no longer tested a second time and the test suite
  runs in more parallel pieces.
tags: [ci, delivery]
badges: [patch]
areas: [backend]
---

## What changed

- A change that was fully tested before merging is no longer fully retested when it lands, as long as nothing else changed underneath it.
- The slowest test steps run in their own parallel jobs and the unit tests are spread over eight groups instead of six.
