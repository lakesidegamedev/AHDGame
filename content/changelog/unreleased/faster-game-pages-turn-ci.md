---
date: 2026-11-18
title: Faster Market and country map startup
summary: Market and country maps start with game data from the server, with less work after the browser opens the page.
tags: [performance, market, maps, turns, ci]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- The Market overview starts with stock and commodity summaries. Its stock chart respects the saved visibility setting before loading.
- Country maps receive their opening data with the page. The US map starts loading its geometry earlier.
- Producer settlement compares matching inventory images with less repeated work. Turn timings identify electricity comparison and index fund snapshots separately.
- CI assigns unit tests to shards using recent file timings and reports time waiting for runners.
