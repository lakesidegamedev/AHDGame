---
date: 2026-10-26
title: Corporation turn writes each company once instead of several times
summary: >-
  The corporation phase folds the separate cash and status updates it makes
  to each company into one write, and matches AI supply deals without
  rescanning every buyer for every seller. No gameplay change.
tags: [performance, turn, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Each company's cash, strategy, brand and quality updates in a turn are now
  sent as one write instead of several, roughly halving the corporation
  phase's write count.
- AI supply agreement matching remembers each buyer's shortage instead of
  recomputing it for every candidate supplier.
- Supply agreement expiry notices are sent in one batch, and political media
  orders apply their effects from one read.
