---
date: 2026-10-27
title: Sector processing does less repeated work each turn
summary: >-
  The per-sector part of the corporation turn rebuilds fewer lookups and copies
  fewer large records for each sector. Sector results are unchanged.
tags: [performance, corporations, turn]
badges: [patch]
areas: [engine]
---

Buyer demand, market tiers, idle upkeep, freight billing and internal supply
reuse per-turn lookups instead of rebuilding or copying them per sector.
