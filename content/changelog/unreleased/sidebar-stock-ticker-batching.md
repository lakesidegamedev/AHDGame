---
date: 2026-11-18
title: "Sidebar stock tickers share database reads"
summary: >-
  The sidebar loads stock tickers for multiple exchanges together, reducing
  database reads when several tickers are visible.
tags: [sidebar, performance]
badges: [patch]
areas: [backend]
---

## What changed

- Sidebar tickers share one snapshot read and at most one price history read per request.
