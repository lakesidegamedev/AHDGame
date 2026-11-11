---
date: 2026-11-11
title: "A failed emergency aid pledge gives the money back"
summary: >-
  If filing the appropriation bill for an aid pledge fails, the treasury is
  refunded, the recovery effects are reversed and the pledge slot is freed.
tags: [engine]
badges: [patch]
areas: [backend]
---

## What changed

- A head of state whose aid pledge fails partway no longer loses the treasury money.
- The crisis recovery and the diplomatic bump are reversed.
- The country can pledge again instead of being told it already pledged.
