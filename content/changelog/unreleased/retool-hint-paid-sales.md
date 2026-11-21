---
date: 2026-11-21
title: "Strategy hint reads what your plant was paid for"
summary: >-
  The strategy suggestion on a plant page now reports what the plant actually
  sold of what it offered, keeps the plant's figures apart from the market's,
  and no longer calls a short market oversupplied.
tags: [corporations, sectors]
badges: [patch]
areas: [frontend]
---

## What changed

- The strategy suggestion now takes the plant's sales from its paid sale record, product by product, instead of a separate market estimate that could be far lower.
- The banner shows the plant's own figures (share of its offer that sold, share of capacity it ran) apart from the market's figure (how much of the product on offer had no buyer).
- The banner only appears when the plant's main product really is oversupplied in its market. A plant that sold most of what it offered, or whose market is short, gets no suggestion.
- A settled plant that sold at least half of what it offered last turn no longer shows the stranded plant warning.
- The per-product sale price on a plant that makes several products is now split by what each product was paid.
