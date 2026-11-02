---
date: 2026-11-02
title: Producer market resumes from its recorded opening
summary: >-
  A world that switched to the funded producer market late now resumes from the
  opening it recorded, instead of refusing every plant because it expected a
  more recent one.
tags: [economy, corporations, turn-processing]
badges: [patch]
areas: [engine]
---

## What changed

- The funded producer turn now reads the world's recorded opening turn when no
  funded turn has settled yet, rather than assuming the previous turn.
- A world whose plants and stock still hold an older opening generation can run
  its next turn, including when the switch to the funded market applied
  retroactively.
- An opening further back than the six-turn catch-up bound still stops the turn,
  as before.

## Risk

- Turn-time economy code: affected plants produce again from their opening
  generation instead of the turn failing outright. Worlds with a settled funded
  turn are unchanged.
