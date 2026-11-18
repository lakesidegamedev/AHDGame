---
date: 2026-11-18
title: Faster Market and country map startup
summary: The Market and country maps start loading useful game data earlier.
tags: [performance, market, maps, turns, ci]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- The Market overview starts with stock and commodity summaries. Its stock chart respects the saved visibility setting before loading.
- Country maps start loading their opening data earlier. The US map preloads its geometry too.
- Producer settlement compares matching inventory images with less repeated work. Turn timings identify electricity comparison and index fund snapshots separately.
- CI assigns unit tests to shards using recent file timings and reports time waiting for runners.
