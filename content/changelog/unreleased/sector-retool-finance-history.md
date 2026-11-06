---
date: 2026-11-06
title: "Retooling a sector now shows in the company's finance history"
summary: >-
  Changing a sector's strategy, or cancelling a change in progress, takes cash
  from the company. That charge now appears in the finance history instead of
  leaving the balance lower with no entry to explain it.
tags: [corporations, finance]
badges: [patch]
areas: [corporations]
---

## What changed

- Switching a sector to a different strategy costs a quarter of the sector's daily revenue. Cancelling a switch part-way costs a share of revenue too. Both charges were taken from company cash without a finance history entry, so a large charge looked like missing money.
- Both now record a "Sector Retooling" entry with the amount, the sector and the old and new strategy. The price itself is unchanged.
