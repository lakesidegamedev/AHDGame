---
date: 2026-11-09
title: "Faster turns: fewer database round trips for index funds and the Treasury"
summary: >-
  Index fund NAV updates and the Treasury budget check now go to the database in
  batches instead of one call per fund or country. Prices and money are unchanged.
tags: [performance, economy]
badges: [patch]
areas: [backend]
---

## What changed

- Each hourly index fund pass now saves every fund's new NAV and backing ratio in
  one batched write instead of one write per fund. The stored values are the same.
- The Treasury phase checks that every country has a federal budget with one read
  instead of one read per country. Missing budgets are still created the same way.
