---
date: 2026-10-26
title: Unused code trimmed from shared modules
summary: >-
  About 4,300 more lines of unused functions, components and tables are gone,
  and over a thousand internal helpers stop being exported. No gameplay
  change.
tags: [maintenance]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- Duplicate budget calculators, unused chart, donut and panel components,
  retired election and NPP helpers and an unused presidential margins table
  were removed.
- Helpers used only inside their own file are no longer exported.
