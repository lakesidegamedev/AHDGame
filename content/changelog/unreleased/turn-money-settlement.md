---
date: 2026-11-14
title: Reconcile sovereign payments and turn settlements
summary: >-
  Keeps funded bond payments, bank vaults and sovereign cash accounting aligned
  across turn retries. Reports discrepancies between Treasury cash books.
tags: [banking, bonds, treasury, currencies]
badges: [patch]
areas: [engine]
---

- Counts bank-held sovereign maturity funding alongside non-bank cash payments,
  using durable settlement receipts in the turn cash was funded.
- Reports funded bond reconciliation gaps with country, turn and cash inputs.
- Rejects issuance receipts with missing or invalid debt face values.
- Preserves guarded settlement retries while sharing reads and batching writes.
