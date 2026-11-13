---
date: 2026-11-13
title: "Audit trail rows now belong to one world"
summary: >-
  Every row in the admin audit trail is now tagged with the world it was written
  in, so staff searches and the automatic anomaly checks only look at the current
  world after a reset.
tags: [audit, reset]
badges: [patch]
areas: [backend]
---

## What changed

- New audit rows record which world they were written in.
- Staff audit searches, exports, trace views, the watchlist and the held turn preview only count rows of the current world when they filter by turn.
- Rows written before this change stay visible in the current world if they were created after it began.
- A reset now saves the old world's audit rows to an archive file and clears them, and the post reset check fails if any row from another world remains.
