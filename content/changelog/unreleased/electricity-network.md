---
date: 2026-11-17
title: Electricity network modes and admin comparisons
summary: >-
  Administrators can compare electricity trading against grid connections,
  shared transmission capacity and losses before enabling enforcement.
tags: [economy, electricity, corporations]
badges: [minor]
areas: [fullstack, engine]
---

## What changed

- Added Off, Shadow Mode and Enforced controls to the admin kill-switch board. Shadow Mode is the default and does not apply its comparison to company cash or inventory.
- Added an Electricity network report under the Economy tools, with route, company, location, price, loss and connection-utilization comparisons.
- Enforced mode applies modeled connectivity, shared capacity and losses to open-market electricity purchases, agreements and internal transfers. Natural gas keeps its existing trading rules.
- Network snapshots stay frozen across interrupted-turn retries. The initial connection catalog uses documented aggregate assumptions rather than engineering-certified limits.
