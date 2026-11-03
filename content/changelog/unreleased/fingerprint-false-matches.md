---
date: 2026-11-03
title: Fewer false alt-account matches for moderators
summary: >-
  Moderator tools no longer link players because they use a common phone or
  browser, and a match on graphics hardware alone is now a low lead.
tags: [moderation]
badges: [patch]
areas: [fullstack]
---

## What changed

- Many unrelated players on the same phone model and browser share one browser
  fingerprint. The duplicate-account panel and the suspicious-players list no
  longer treat a fingerprint shared by more than eight accounts as a link. The
  alt-detection engine already ignored them.
- Two accounts with the same browser and graphics card but different
  fingerprints were flagged as a medium device match. That is now a low lead to
  check against other evidence.
- No game rules changed.
