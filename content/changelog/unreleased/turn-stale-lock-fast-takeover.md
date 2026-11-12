---
date: 2026-11-12
title: "A stuck turn is picked up within minutes"
summary: >-
  When the process running an hourly turn stops responding, the game can now
  take the turn over after about three minutes and continue from the step it
  reached, instead of waiting twenty minutes or more. Off until switched on.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The process running a turn now records who holds the turn lock.
- A watchdog checks every minute and takes over a lock whose owner has gone quiet for about three minutes, continuing the turn from where it stopped.
- A process that loses its lock can no longer overwrite the new owner's progress.
- Nothing changes until the turn resilience switch is turned on.
