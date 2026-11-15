---
date: 2026-11-10
title: "Moderator ledger timeline is now in turn order"
summary: >-
  The moderator and admin financial ledger lists transactions by turn, newest
  first, instead of by when each log entry happened to be written.
tags: [moderation, economy]
badges: [patch]
areas: [backend]
---

## What changed

- The ledger timeline sorts by turn, then by time within the turn, newest first.
  Turns no longer appear out of order.
- Paging with "load more" continues from exactly where the last page ended.
- The CSV export uses the same order.
