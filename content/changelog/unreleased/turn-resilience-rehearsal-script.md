---
date: 2026-11-13
title: "Rehearsal script for turn recovery"
summary: >-
  A developer script now rehearses a stopped, killed or paused turn on a
  throwaway world and reports how long recovery took. No change for players.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A rehearsal script runs a turn with the automatic retry, kills it mid-step, or pauses it, then reports recovery times.
- It only runs against throwaway worlds and refuses any other database.
