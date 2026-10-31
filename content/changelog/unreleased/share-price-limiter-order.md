---
date: 2026-10-26
title: Share prices stop drifting down for owner-controlled public companies
summary: >-
  A public company whose chief executive owned almost all of its shares could
  see its share price slip a few percent every turn and then jump many times
  over in a single turn. Prices now move at most 35% a turn and settle at the
  company's value.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- The 35% limit on how far a share price may move in one turn is now applied
  after the insider-ownership and index-fund adjustments rather than before
  them, so both prices it compares are the ones the market actually shows.
- For a public company where the chief executive owns almost all of the
  shares, the old order compared a discounted previous price with an
  undiscounted value. The price therefore fell about 5% a turn until it reached
  the minimum, then jumped back to the discounted value in one step. It now
  moves at most 35% a turn toward the company's value and stays there.
- Private companies and public companies without heavy insider ownership price
  as before. The value a company settles at is unchanged.
