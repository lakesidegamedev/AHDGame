---
date: 2026-11-10
title: "Plants stuck at a minimal run can grow again"
summary: >-
  When a market is only a few percent oversupplied, plants that had dropped to
  their minimum run now step back up a little each turn instead of staying
  stuck.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- A plant running at or near its minimum (under 5% of capacity) that still sells at least 90% of what it offers now adds 1% of its capacity per turn, up to 5%.
- Before, only a plant that sold out completely could grow, so in a market oversupplied by a few percent every plant was rationed and low plants never recovered.
- Plants that lose money on each unit sold, or that already carry more than a turn of sales in stock, do not step up.
- The step is small on purpose, so many plants recovering together cannot flood a market in one turn. Wages, input purchases and output follow the new run as before.
