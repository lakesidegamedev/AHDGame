---
date: 2026-10-26
title: Treasury and fund redemptions do less repeated work
summary: >-
  The treasury phase reads only the budget fields it uses, and fund
  redemptions owed to holders that no longer exist stop blocking other
  payouts every turn.
tags: [performance, turn, treasury, index-funds]
badges: [patch]
areas: [engine]
---

## What changed

- Each turn the treasury loads only the parts of a government budget it needs
  instead of its whole bookkeeping history.
- A queued fund redemption for an account that no longer exists is skipped
  instead of being retried every turn. Before, it could hold up other
  holders' payouts and force the fund to sell assets for a payment that could
  never be made.
