---
date: 2026-11-11
title: "A turn interrupted by the update finishes without repeating steps"
summary: >-
  If the server updates while a turn is half finished, the new release
  recognises the steps the old one already ran, even where it groups them
  differently, and does not run them a second time.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- Approval fading, national bill votes and national elections are not repeated when a turn the old release started is finished by the new one.
- If only some countries' bills or elections had run, the rest wait for the next turn instead of risking a double run.
