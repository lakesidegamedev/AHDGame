---
date: 2026-11-16
title: "Lean map colours and region pages follow the party-lean scale"
summary: >-
  Lean map shading now centres on each country's even split between its two main
  parties, and province and state pages, the map lean panel and the demographics
  tab show the same Solid, Likely, Leans or Swing label as the map.
tags: [map, demographics, canada, ui]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- Lean map fills on the combined, economic and social views shade from the point where a country's two main parties split evenly, so Liberal-leaning Ontario no longer shades as right-wing. US shading is unchanged because its even split already sits at zero.
- The state and province header, the map lean panel and the demographics tab show the party-lean label (for example "Solid Conservative" or "Swing") alongside the raw lean numbers.
- Lean values and every candidate and party distance are unchanged.
