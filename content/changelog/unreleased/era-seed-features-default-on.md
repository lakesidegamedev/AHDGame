---
date: 2026-11-12
title: "New eras get seed features by default"
summary: >-
  Starting corporations and partyless openings now apply to every era unless
  the era is on a written exclusion list, so a new era is not silently skipped.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- Starting NPP corporations, one competitor per market in NPP-run countries, and the no-starting-parties option are now on for every era except listed exclusions, each with a reason.
- Every existing era behaves exactly as before; tests pin the result for each one.
