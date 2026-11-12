---
date: 2026-11-12
title: "Reset rehearsal checks national figures against reference ranges"
summary: >-
  The reset rehearsal now fails when a seeded country has income, interest
  rate, inflation or debt far outside a believable range.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The rehearsal compares each country's GDP per head, central bank rate, inflation and debt to GDP with a wide reference range.
- A rostered country with no reference row fails the rehearsal.
- The ranges are authored plausibility bounds meant to catch wrong units or currencies, not sourced statistics.
