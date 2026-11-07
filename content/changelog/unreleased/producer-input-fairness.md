---
date: 2026-11-07
title: "Fairer access to scarce production inputs"
summary: >-
  Companies share scarce inputs proportionally instead of losing supplies to
  older order IDs. Automatic buying limits leave room for price movement
  above the previous clearing price.
tags: [economy, corporations, markets]
badges: [patch]
areas: [engine]
---

- Ordinary producer input orders of equal priority share available supply according to their remaining demand, price limits and budgets.
- Plants sharing company cash also share that budget fairly within each allocation, instead of the first plant spending its siblings' shares.
- Own-site delivery priority, local freight priority, restricted routes and supplier reservations remain in effect.
- Input buying limits apply existing price headroom to the last clearing price, bounded against an independent reference. Output reference prices do not change.
