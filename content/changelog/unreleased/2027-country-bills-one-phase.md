---
date: 2026-11-10
title: "Country bill lifecycles run as one turn step"
summary: >-
  The hourly turn now advances every country's bills in one step instead of
  one step per country. Bills pass, fail and expire exactly as before.
tags: [engine, legislation]
badges: [patch]
areas: [engine]
---

## What changed

- Bill progress for every country in play now happens in a single turn step, which removes per-step bookkeeping from every turn.
- If one country's bill processing fails, the other countries still finish and the failure is reported by name.
- Bill outcomes and timing are unchanged.
