---
date: 2026-11-09
title: "Election engine reads buckets only"
summary: >-
  The election engine and the primary carve-up now work purely from voter
  buckets. The candidate tag on the primary carve-up panel is gone.
tags: [elections, engine]
badges: [patch]
areas: [frontend, engine]
---

## What changed

- Candidate approval modifiers in vote counting are now handled as bucket approvals throughout the election engine.
- Primary carve-up rows no longer carry a demographic-style tag; the UK Commons carve-up keeps showing the party name.
