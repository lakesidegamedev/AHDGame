---
date: 2026-11-09
title: "More reliable automated checks"
summary: >-
  Two automated checks that sometimes failed for no real reason now run
  steadily. The game itself is unchanged.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The world reset check no longer uses up all available memory when it runs on its own, so it stops crashing before it can report anything.
- The campaign map zoom check no longer occasionally fails by acting before the map is ready.
- Nothing changes for players.
