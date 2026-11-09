---
date: 2026-11-07
title: Freight and own-site labels say what they measure
summary: >-
  The "stuck" freight warning and the "to your sites" share on sector cards now
  say which goods they cover.
tags: [economy, logistics]
badges: [patch]
areas: [frontend]
---

## What changed

- The freight warning on a sector now reads "up to N% stuck". The number is the
  worst-affected good the sector makes, not a share of everything it makes, and
  the tooltip says so.
- The "to your sites" figure on a sector card now reads "N% of all output to
  your sites". It is out of every product the sector makes, so a logistics
  sector that also sells consulting can show a lower share than its freight
  alone. Goods your own trucks haul to other buyers are not part of it.
- Only wording changes. No numbers, prices or deliveries are affected.
