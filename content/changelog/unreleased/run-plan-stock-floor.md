---
date: 2026-11-08
title: Plants with a pile of unsold goods make less until it clears
summary: >-
  Behind the next step of the production planning switch, a plant's guaranteed
  minimum run no longer counts stock it is already holding beyond a turn's
  sales, so a plant sitting on a pile sells from it instead of making more.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- A plant never plans to make less than it sold last turn. A plant that sold
  what it made but also carried a large pile of unsold goods therefore kept
  running in full, and the pile kept growing. Natural gas reached about 160,000
  unsold units, growing every turn, and prices kept falling.
- At the next step of the switch, stock held beyond one turn of sales is taken
  off that minimum. The plant sells from its pile and makes less until the pile
  is back to about a turn of sales.
- Plants without a pile keep the same guarantee.
