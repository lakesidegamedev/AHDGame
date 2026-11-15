---
date: 2026-11-12
title: "Company turn writes are journaled so an interrupted turn can resume"
summary: >-
  Behind a switch that is off, the company turn now stores its planned money
  writes before applying them, so an interrupted turn can finish the same plan
  without paying anyone twice. Nothing changes for players while the switch is off.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- Added a turn resilience switch, off by default.
- With the switch on, sector, company cash and product development writes are stored in chunks first, stamped per company, and marked as they land.
- With the switch off, the writes behave exactly as before.
