---
date: 2026-10-18
title: Owner limits for NPP operators, engine side
summary: >-
  The corporation brain now reads an optional operator policy that limits what an
  NPP operator may do for a corporation. Nothing changes until a policy is set.
tags: [corporations, npc, autopilot]
badges: [patch]
areas: [engine]
---

- A corporation can carry an operator policy with per-action permissions (found, grow, divest, retool, borrow, budgets, dividends, research) and optional lists of sector types and countries the operator may expand into.
- Without a policy each role behaves exactly as before: autopilot still never borrows or retools and asks before divesting or researching, and a parent-owned AI corporation still keeps its parent's plants.
- Limits on sectors and countries apply to new founding and plant growth; replacing worn capacity is never blocked.
- There is no editor yet. The settings page follows.
