---
date: 2026-11-12
title: "Rehearsal fault injection fires once across retries"
summary: >-
  The rehearsal-only failure injector now stays spent between turn attempts,
  so a one-time injected failure no longer repeats on every retry. It has no
  effect in the live game.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A one-time injected failure in a rehearsal world is no longer re-armed by each turn attempt.
- No change for the live game.
