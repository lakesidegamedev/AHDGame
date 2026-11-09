---
date: 2026-11-09
title: "Region demographics tab covers every country"
summary: >-
  The demographics tab on region pages no longer depends on a per-country
  voter-group profile. Every country with census data shows its electorate.
tags: [demographics, countries, ui]
badges: [patch]
areas: [frontend, engine]
---

## What changed

- The region demographics tab now shows the census breakdown and electorate profile for every country, including ones that were previously left blank (such as the Baltic states).
- Behind the scenes, the per-country voter-group profile ids and the unused voter-group weight tables were removed. Canvassing options per country are unchanged.
