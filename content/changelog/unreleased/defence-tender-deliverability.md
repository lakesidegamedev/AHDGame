---
date: 2026-11-15
title: Defence tenders must fit what one supplier can take
summary: >-
  Publishing a defence tender that no single supplier could deliver is now
  rejected with the largest lot count that would fit, and bid or award
  refusals name the remaining allowance and the highest fitting price.
tags: [contracts, defence]
badges: [patch]
areas: [backend]
---

## What changed

- Publishing a defence tender whose lots cannot fit within one supplier's
  quarterly share, even at the cheapest permitted price per lot, is rejected.
  The message names the largest lot count that would fit at the floor price.
- A bid or award refused under the quarterly concentration limit now states
  how many lots still fit at the bid price and the highest price per lot at
  which the requested lots would fit, or that no price fits.
