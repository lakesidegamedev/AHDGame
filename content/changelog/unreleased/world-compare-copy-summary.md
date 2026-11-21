---
date: 2026-11-17
title: Copy a comparison as readable text
summary: >-
  A comparison picked on the world map can be copied as a short set of lines, so
  a chat message shows both nations' figures before anyone opens the link.
tags: [world]
badges: [minor]
areas: [frontend]
---

- Copy summary in the comparison panel writes both names, their overall scores
  with world ranks, the category average and up to three metric lines, then the
  comparison link.
- The lines come from the same rows the panel shows, in the same order, so a
  pasted summary matches what the sender sees.
- A metric only one side has stays in the panel rather than being pasted as a
  comparison against nothing.
