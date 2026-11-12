---
date: 2026-11-12
title: "Developer tool to compare the world before and after a turn rehearsal"
summary: >-
  A new rehearsal tool snapshots a test world and reports any difference between
  two runs, so we can prove a retried turn ends exactly like a clean one.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- Added a snapshot and compare tool for test worlds used in turn rehearsals.
- It only runs against throwaway test databases and does not change the live game.
