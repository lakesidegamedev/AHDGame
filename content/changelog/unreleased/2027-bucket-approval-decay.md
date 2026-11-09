---
date: 2026-11-09
title: "Approval decay runs on demographic buckets"
summary: >-
  The turn step that fades your standing with voters back toward neutral now
  names and reports itself in terms of demographic buckets, not voter groups.
tags: [turn, demographics, approval]
badges: [patch]
areas: [engine]
---

## What changed

- The per-turn fade of approval modifiers (0.5% a turn, about a fifth over a game year) is unchanged in size. It applies to every demographic bucket modifier a politician holds.
- The turn step is now called bucket approval decay in turn logs and diagnostics.
