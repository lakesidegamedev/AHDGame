---
date: 2026-11-19
title: Fix regional government office panels
summary: >-
  The Sovereignty tab now appears only when you view an eligible regional office as a character
  from that country. Parliamentary regional offices no longer show impeachment filing notices.
tags: [government, sovereignty]
badges: [patch]
areas: [frontend]
---

## What changed

- Use the active character's country when loading the regional sovereignty readout.
- Show the regional impeachment panel only in presidential systems.
