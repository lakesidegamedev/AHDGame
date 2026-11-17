---
date: 2026-11-17
title: "Fix: absurd build prices for clinics and other local services"
summary: >-
  The market-size surcharge on new capacity now measures against what people
  actually want, not the small slice the market could fund, so a single clinic
  no longer quotes in the billions.
tags: [corporations, economy, bugfix]
badges: [patch]
areas: [backend]
---

## What changed

- A healthcare build in a state with little funded demand was quoted at thousands of times its normal price. The surcharge for owning a large share of a market now counts the full demand for the service.
- Prices for markets that already had plenty of funded demand are unchanged.
