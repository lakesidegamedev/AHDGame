---
date: 2026-11-18
title: Faster Market startup
summary: The Market shows stock rows and commodity summaries earlier.
tags: [performance, market, turns, ci]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- The Market overview starts with stock and commodity summaries. Its stock chart respects the saved visibility setting before loading.
- Producer settlement compares matching inventory images with less repeated work. Turn timings identify electricity comparison and index fund snapshots separately.
- CI assigns unit tests to shards using recent file timings and reports time waiting for runners.
