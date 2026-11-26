---
date: 2026-11-26
title: Corporation stat labels no longer read top to bottom
summary: >-
  In narrow columns the Operations card squeezed labels such as Marketing
  strength into one letter per line. Labels now keep their width and the
  forecast note wraps instead.
tags: [corporations, ui]
badges: [patch]
areas: [frontend]
---

## What changed

- Labels in corporation stat lists keep a readable minimum width.
- The note beside a figure, such as "forecast next turn, last turn", wraps onto a second line when space is short, instead of pushing the label down to one letter per line.
