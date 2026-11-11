---
date: 2026-11-11
title: Repair the US 2027 opening
summary: >-
  Repairs US opening budgets, Cabinet funding, district holders, population
  totals and state election calendars. Uses dated provisional 2026 results
  with explicit fallbacks for unresolved or missing counts.
tags: [elections, budgets, resets]
badges: [patch]
areas: [engine]
---

- Maps the current law book to Cabinet funding and preserves the modeled
  spending composition through budget refreshes.
- Reconciles regional GDP, conserves whole-person population totals, and
  links opening House delegations to district holders.
- Replaces stale political allocations with a November 11 provisional
  snapshot, including Nebraska's nonpartisan chamber and Wyoming's 31 seats.
- Uses state-specific regional election years. State senates still use
  aggregate chamber renewal; missing counts and unmapped laws are labeled.
- Adds opening diagnostics and integrated regression coverage.
- Preserves Senate classes on opening incumbents and isolates incumbent lookups
  by country, including legacy US records.
- Matches 2027 House holders to the provisional district results and conserves
  demographic shares at exactly 100 percent.
- Ships corrected Census CD120 geometry for all 435 voting districts in the
  2027 preset. Historical map assets remain separate. Missing PVI uses a
  labeled modeled fallback rather than claiming observed voting data.
