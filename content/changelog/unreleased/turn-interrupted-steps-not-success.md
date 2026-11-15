---
date: 2026-11-13
title: "An interrupted turn is no longer reported as a success"
summary: >-
  When the game restarts a turn that was cut off partway, any money step that
  was mid-flight is not repeated. Such a turn is now recorded as incomplete and
  raises an alert instead of being reported as a success.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A resumed turn that skipped an interrupted money step is recorded as incomplete, not successful, and raises an alert naming the steps.
- Every turn log now lists which steps ran, which were skipped as already done, which were interrupted and which never ran.
- Snapshot, history and decay steps that were cut off do not make a turn incomplete.
- Timing is unchanged: the turn still waits the same time before taking over a stuck turn.
