---
date: 2026-11-17
title: Debt readout in the map comparison
summary: >-
  Each picked nation in the comparison panel now shows its effective sovereign
  rate, where its debt ratio lands in five years, which way it is moving and the
  primary balance that would hold it flat.
tags: [world, economy, budget]
badges: [minor]
areas: [frontend]
---

- The comparison panel reuses the economy payload the recent-path charts already
  fetch, so the debt rows add no second request per nation.
- Effective rate comes from the same rate breakdown the budget rollover charges:
  ladder, IMF cap, investor confidence and trajectory premium.
- The five-year ratio chains the debt-dynamics identity at the path's own ladder
  basis, holding today's primary balance, growth and inflation.
- The block says how much primary surplus would hold the ratio flat, or how much
  deficit it can run, and marks a rising ratio in the warning tone.
- A nation without a stored budget shows no debt rows instead of zeros.
