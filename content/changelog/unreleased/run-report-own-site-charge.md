---
date: 2026-11-10
title: Sector run card shows what your own sites charged the sector
summary: >-
  The per-unit bar on a sector's run card now has a "Charged by your sites"
  segment, so the profit it shows per unit matches the sector's profit after
  its own sites billed it for inputs.
tags: [corporations, sectors]
badges: [patch]
areas: [frontend]
---

## What changed

- A sector fed by your own farms or mines is billed by those sites for the
  inputs they supply. The run card's per-unit bar left that charge out, so the
  sector looked more profitable per unit than its profit showed.
- The bar now shows the charge as its own segment and counts it in the cost
  and the "Earns" or "Loses" figure. It is income to your own sites, so your
  company as a whole is unaffected.
