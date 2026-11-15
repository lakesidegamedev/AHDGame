---
date: 2026-11-11
title: "Regional voter shifts carry over to the new release"
summary: >-
  How far each region's voters have moved left or right since the world began
  is kept when the server updates. Before this fix, every region would have
  snapped back to its starting views.
tags: [politics, elections]
badges: [patch]
areas: [backend]
---

## What changed

- The shifts in regional voter views built up from newsrooms and laws move to their new place automatically when the server starts.
- Polls, maps and elections read the same voters the day after the update as the day before.
- The shifts keep fading slowly over time, exactly as before.
