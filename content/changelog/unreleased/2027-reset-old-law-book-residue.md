---
date: 2026-11-11
title: "A world reset leaves no old law types behind"
summary: >-
  Resetting a world now removes saved electorate priorities that point at laws
  from the old catalogue, and the post-reset check fails if any old law type
  survives.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- A reset removes admin electorate priorities that name a law type from the retired catalogues. Priorities on the new law book stay.
- The check that runs after a reset now fails if a law type, enacted law, bill or saved priority still names a retired law type, and the world stays paused until a clean reset.
- The read-only preflight lists any such documents before a reset and fails on them in a fresh world.
