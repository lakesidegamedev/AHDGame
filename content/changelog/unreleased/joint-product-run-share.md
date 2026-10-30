---
date: 2026-10-30
title: Plants that make two products follow the one that sells
summary: >-
  A plant that makes more than one product no longer shuts down because one of
  them is piling up unsold. If another product sells out and pays the plant's
  running costs, the plant keeps running for it.
tags: [corporations, plants, market, production]
badges: [patch]
areas: [backend]
---

## What changed

- Some plants make several products at once. A standard chemical plant, for
  example, makes a lot of chemicals and a little plastic. Before, the plant
  decided how hard to run by adding up all of its products together. When
  chemicals piled up unsold, the plant cut its whole run, and plastic output
  fell with it, even though every unit of plastic sold.
- Now each product is planned on its own. The plant runs at the level its
  best selling product asks for, as long as the products that sell at that
  level earn enough per unit to pay the whole plant's inputs, wages and site
  costs. If they do not, the plant plans the way it did before.
- The extra units of the slow product go into the plant's stock, as unsold
  goods already did. They are offered again next turn, marked down when stock
  piles up, and slowly written down.
- Plants that make a single product are not affected, and a plant whose
  products are all piling up still cuts back as before.
- This applies to newly started economies, and to the live world once it is
  switched on there.
