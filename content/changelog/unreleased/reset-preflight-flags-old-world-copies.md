---
date: 2026-11-13
title: "The pre-reset check flags leftover copies of an old world"
summary: >-
  The check that runs before a reset now reports snapshot, backup and one-off
  recovery collections that an earlier world left behind, because no reset
  empties them. Nothing is deleted.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The pre-reset check lists recovery and heal snapshots, backups, dated one-off collections and old rollout records that are not part of the seed manifest.
- Each group fails the check with its collection names, so they are archived deliberately before a reset.
- Other services' collections are not flagged.
