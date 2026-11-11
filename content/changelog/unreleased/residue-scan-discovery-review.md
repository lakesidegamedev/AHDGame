---
date: 2026-11-11
title: "Release checks accept the reviewed reset scan change"
summary: >-
  The check that tracks which collections the post-reset scan reads now knows
  about the scan's new retired law check. No change for players.
tags: [admin]
badges: [fix]
areas: [backend]
---

## What changed

- The post-reset scan's new check for retired law ids was reviewed and recorded, so the release checks pass again.
