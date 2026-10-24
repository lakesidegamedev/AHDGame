---
date: 2026-10-24
title: The producer-market shadow finishes after the turn
summary: >-
  Most of the producer-market shadow now runs after the turn ends instead of
  inside the corporation phase, taking about half a minute off every turn.
  Telemetry only; no gameplay change.
tags: [performance, turn, observability]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The shadow's demand build still runs inside the corporation phase, because
  it reads that phase's live state. Its market run, close and evidence work
  only on a detached copy of that build, and now run after the turn's lock is
  released.
- On a copy of the live world the shadow's time on the turn fell from about
  41 seconds to 9; the remaining 25 seconds run in the gap before the next
  turn.
- The shadow's summary is the same as before. Its `ms` field is still compute
  time, and it now also records `msOnTurn` and `deferred`.
- If the copy cannot be made faithfully, the shadow runs inside the phase as
  before. The next turn's corporation phase finishes any shadow still pending,
  so carried shadow state stays continuous.
