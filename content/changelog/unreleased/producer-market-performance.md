---
date: 2026-11-07
title: "Faster market clearing with trade restrictions"
summary: >-
  Markets reuse supplier-route lookups and store repeated supplier lists once,
  reducing processing and receipt costs while retaining fair input allocation
  and embargo enforcement.
tags: [economy, corporations, markets, performance]
badges: [patch]
areas: [engine]
---

- Shared route and supplier lists are compacted in immutable market receipts. Existing receipts remain readable.
- Fair allocations reuse route eligibility and supplier cohorts without changing priority, budgets or blocked trade routes.
- A separate pre-settlement execution deadline is checked inside clearing and receipt preparation, so a slow market stops before committing its settlement rather than running past the corporation phase timeout.
