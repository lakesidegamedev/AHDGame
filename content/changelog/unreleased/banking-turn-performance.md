---
date: 2026-11-07
title: "Faster banking turn maintenance"
summary: >-
  Banking reuses turn-wide configuration and capacity reads, and NPC bank
  maintenance loads country eligibility and existing banks together.
tags: [banking, performance]
badges: [patch]
areas: [engine]
---

- Bank servicing batches financial-sector capacity and configuration reads while retaining live balance reads and existing money-movement locks.
- NPC bank maintenance still checks eligibility each turn, including countries opening to private banking, with fewer repeated queries.
- Bootstrap includes lookup indexes for bank loans, NPC bank identities and savings holders in every currency. Existing worlds have a separate index installer.
