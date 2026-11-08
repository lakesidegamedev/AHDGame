---
date: 2026-11-07
title: "Faster market clearing with trade restrictions"
summary: >-
  Markets reuse supplier-route lookups and store repeated supplier lists once,
  reducing processing and receipt costs while retaining fair input allocation
  and embargo enforcement.
tags: [economy, corporations, markets, performance]
badges: [patch]
areas: [engine]
---

- Shared route and supplier lists are compacted in immutable market receipts. Existing receipts remain readable.
- Fair allocations reuse route eligibility and supplier cohorts without changing priority, budgets or blocked trade routes.
- A separate execution deadline bounds market clearing. Once a market is fully computed, its receipt can finish encoding and durable settlement instead of discarding that completed work.

- Market preparation shares one supplier-route index across producers and final buyers, retaining domestic access and embargo restrictions.
- Receipt encoding batches plain supplier IDs and deadline checks. Staging verifies freshly encoded chunks against their exact stored bytes; existing encodings still receive full checksum verification.
- Receipt chunk reads use larger bounded batches without changing compression, chunk identities or recovery compatibility.
- The corporation phase has a fixed six-minute timeout. The market pre-settlement deadline leaves 90 seconds for settlement and other corporation work.
