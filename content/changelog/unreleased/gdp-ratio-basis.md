---
date: 2026-11-08
title: "Budget balance now uses the same GDP as the debt ratio"
summary: >-
  The national budget balance figure was measured against an older yearly GDP
  snapshot while the debt ratio beside it used smoothed GDP. Both now use the
  same GDP, so the two ratios agree.
tags: [economy, budget]
badges: [patch]
areas: [backend]
---

## What changed

- The national budget balance (surplus or deficit as a share of GDP) and the same figure shown on sector pages now divide by the smoothed GDP, the same basis the debt-to-GDP ratio already used.
- Reported growth is unchanged: it stays an annual real rate, applied one turn at a time. New long-run checks confirm it stays consistent over decades.
