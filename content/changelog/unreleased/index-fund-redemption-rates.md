---
date: 2026-10-28
title: Queued index fund withdrawals pay out again
summary: >-
  Index fund withdrawals waiting in the queue now pay out again instead of
  being skipped every turn.
tags: [economy, index-funds]
badges: [patch]
areas: [backend]
---

Index fund withdrawals that were waiting in the queue now pay out again: the
redemption pass reads each fund's exchange rate together with its currency, so
a waiting withdrawal is no longer skipped for a rate the pass already had.
