---
date: 2026-11-09
title: "Faster turns with crisis detection on"
summary: >-
  The crisis watchers now share one database read each turn instead of making
  one each, which trims turn time. No gameplay changes.
tags: [engine, performance]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each turn the crisis watchers read their running counts together instead of one watcher at a time. Crises open and close exactly as before.
