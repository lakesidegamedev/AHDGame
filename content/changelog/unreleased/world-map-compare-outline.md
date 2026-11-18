---
date: 2026-11-17
title: Comparison picks are outlined on the globe
summary: >-
  The two nations picked in the world map's compare mode now carry an outline on
  the map itself, so both sides stay visible over whatever colour the active
  filter paints them.
tags: [world]
badges: [patch]
areas: [frontend]
---

- Both comparison picks keep a stroke over the active heatmap or tier fill, so
  the two sides are findable on the globe without reading the panel.
- The outline follows the owning country, so a British-Isles overlay blob and
  its base feature read as one pick.
- The fill is untouched: the map still says what the filter says, and the
  outline says which nations are being compared.
