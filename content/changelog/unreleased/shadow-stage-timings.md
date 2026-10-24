---
date: 2026-10-24
title: The producer-market shadow reports where its time goes
summary: >-
  Each producer-market shadow summary now records how long each of its stages
  took. Telemetry only; no gameplay change.
tags: [performance, turn, observability]
badges: [patch]
areas: [engine, backend]
---

## What changed

- `producerMarketShadows` documents gain `stageMs`: plant preparation,
  households, public buyers, accounts, orders, the market run, the close, the
  evidence gates and the state write, in milliseconds.
- The shadow takes 47 to 65 seconds of every live turn. These timings decide
  how it moves off the turn's critical path.
