---
date: 2026-11-13
title: "The map and elections pages open faster"
summary: >-
  The country map starts loading its drawing code and outline while its data
  arrives, the elections banner photo now comes from our own servers, and live
  turn updates are much smaller.
tags: [performance]
badges: [patch]
areas: [fullstack]
---

## What changed

- The country map no longer waits for its data before it begins loading the map itself.
- The elections banner photo is a smaller copy served from our own site instead of Wikimedia.
- While a turn is processing, the status your browser checks every couple of seconds is far smaller.
- Nothing about how these pages look or work has changed.
