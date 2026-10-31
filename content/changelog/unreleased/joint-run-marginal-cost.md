---
date: 2026-10-30
title: Plants with two products weigh only the costs that grow with output
summary: >-
  When a plant decides whether to run harder for the product that sells out,
  it no longer counts the upkeep it pays on idle equipment anyway.
tags: [corporations, plants, market, production]
badges: [patch]
areas: [backend]
---

## What changed

- A plant that makes two or more products, such as an oil and gas well, can
  run harder for the product that sells out while the other piles up. It only
  does so when that product earns enough per unit to pay for running harder.
- That test used to count the small upkeep a plant pays on its idle
  equipment. The plant pays that upkeep whether it runs or not, so it no
  longer counts against running more. Inputs, wages and site costs that grow
  with output still count, so running harder still has to pay for itself.
- The plant still speeds up a step at a time, faster when its product is
  badly short, rather than jumping to full output at once.
- One-product plants are not affected. A plant whose products are all piling
  up still cuts back as before.
- This applies to newly started economies, and to the live world once it is
  switched on there.
