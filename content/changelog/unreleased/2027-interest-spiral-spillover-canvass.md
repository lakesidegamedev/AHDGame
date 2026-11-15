---
date: 2026-11-09
title: "Debt spirals, spilled crises and canvassing costs now work as designed"
summary: >-
  Background countries drowning in debt interest now restructure, crises that
  spread between countries now end, and canvassing costs follow the era's prices.
tags: [economy, crises, campaigns]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A background country whose debt interest stays above half of its revenue for two fiscal years now restructures its debt, with the haircut, market lockout and news that other countries already got. Before, its counter was reset and nothing happened.
- A crisis that spreads from one country to another now carries the length and effects of the crisis it becomes, so it runs its course and ends instead of sitting at its peak for ever without doing anything.
- Canvassing now costs the same share of income in every era. In early-era worlds it was charged at the modern price, many times the intended cost.
- Running the bucket approval data migration after the new build has started no longer overwrites approval changes made since deploy.
