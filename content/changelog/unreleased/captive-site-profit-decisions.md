---
date: 2026-11-06
title: Plants that supply their own company are no longer treated as losing money
summary: >-
  When deliveries between a company's own sites are valued at market prices, a
  plant whose output goes to its own company is now judged on that value, so
  it is no longer marked as struggling or wound down for output its company
  would otherwise have bought.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- With own-site deliveries valued at market prices, a plant that hands its
  output to its own company's other sites books that value, and the site that
  receives it books the same amount as a cost. Until now the operating
  decisions ignored both, so a supplying plant read as a loss even when its
  company was saving the full market price.
- The transition "losing" and "no sales" marks, restart trials for idle plants,
  and the loss counts AI-run companies use to mothball sites now read the
  plant's result including those deliveries. The receiving site carries the
  matching cost in the same decisions.
- Company cash, company totals, taxes, valuations and profit payouts are
  unchanged: the two entries cancel inside the company, so no money is created.
- Nothing changes until own-site deliveries are valued at market prices.
