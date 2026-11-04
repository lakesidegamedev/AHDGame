---
date: 2026-11-04
title: Plants recover their output from their plan, and the page says what holds them
summary: >-
  Behind a new switch, off until it is turned on, a plant that sells out plans
  next turn's output from what it planned, not from what a cash or input
  shortage let it make, recovers in steady steps, and needs two bad sales turns
  in a row before it drops to a minimum run.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, corporations, production]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Behind a new switch, off until it is turned on, a plant plans each turn's
  output from the output it planned last turn. A turn where short cash or a
  short input cut what it made no longer lowers next turn's plan, so a plant
  that is a little short every turn keeps its plan instead of sliding down.
- A plant that sold everything and covered its costs grows by a fixed step of
  15% of its capacity a turn, or faster when its market is short. A plant at
  its minimum run is back to a full run in about seven turns instead of
  seventeen or more.
- One turn of almost no sales now steps a plant's plan down by a tenth. Only a
  second such turn in a row drops it to its minimum run.
- The sector page no longer says "Ramping up" when a plant sold out but was cut
  by cash or a missing input. It says "Held by cash" or "Held by" the input
  that ran short.
