---
date: 2026-11-21
title: "Build queue says what is finished and running"
summary: >-
  The sector build queue now says how many facilities are finished, and notes
  that only finished ones run, instead of calling partial deliveries built.
tags: [corporations, sectors]
badges: [minor]
areas: [frontend]
---

## What changed

- The "Under construction" list reads "12 of 200 clinics finished" instead of "built", counting whole facilities only.
- Each order now notes that only finished facilities run, so a new order no longer looks like running plants that are missing.
