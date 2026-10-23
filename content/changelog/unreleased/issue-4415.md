---
date: 2026-10-23
title: Every reason a plant is idle now has its own colour
summary: >-
  The run meter used to paint several different idle causes in the same shade,
  so the legend could not tell you which problem you were looking at. Each
  cause now has its own colour, and its legend dot matches its bar segment.
tags: [corporations, accessibility]
badges: [patch]
areas: [frontend]
---

## What changed

- Each idle cause draws with its own colour on the run meter instead of borrowing its severity tone.
- The legend dot for a cause is drawn from the same colour as its bar segment, so the two always match.
- The test suite fails if two causes are ever given the same colour again.
