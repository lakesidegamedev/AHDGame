---
date: 2026-11-12
title: "Failed turn steps now record why they failed"
summary: >-
  When an hourly turn step fails, the turn log now keeps the error text and
  where it came from, so problems are diagnosed from the log instead of by
  digging through the server.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A failed turn step stores its error message plus the first lines of where it happened.
- A turn that stops entirely stores that error on the turn log and on the game state.
- Rehearsal worlds can inject a failure into a chosen step to test recovery. This is never active in the live game.
