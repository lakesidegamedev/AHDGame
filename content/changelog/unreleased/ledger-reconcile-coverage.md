---
date: 2026-11-17
title: "Money audit covers campaign wallets and new characters"
summary: >-
  The internal money audit now tracks campaign funds as their own wallet,
  records the starting money of new characters, and names five transaction
  types it used to leave unlabelled.
tags: [economy, ledger]
badges: [patch]
areas: [engine]
---

## What changed

- Campaign funds are audited as their own wallet instead of being compared against personal cash, so campaign income no longer shows up as an unexplained difference.
- A new character's starting personal and campaign money is now recorded as a system grant.
- Bond issuance, savings deposits and withdrawals, currency exchanges and IPO proceeds now carry named reasons in the money-supply audit.
- Household wallets held in pre-euro currencies are valued at the same rate the economy uses, which removes a false difference in France and Italy.
- Nothing a player holds or earns changes. This is audit coverage only.
