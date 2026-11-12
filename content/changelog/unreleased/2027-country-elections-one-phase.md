---
date: 2026-11-10
title: "Country elections run as one turn step"
summary: >-
  The hourly turn now checks every country's election schedule in one step
  instead of dozens of separate steps. Election dates and results do not
  change.
tags: [engine, elections]
badges: [patch]
areas: [engine]
---

## What changed

- Scheduling of upcoming elections for every country in play now happens in a single turn step, which removes a lot of per-step bookkeeping from every turn.
- If one country's election scheduling fails, the others still finish and the failure is reported by name.
- Which elections exist, when they open and how they resolve is unchanged.
