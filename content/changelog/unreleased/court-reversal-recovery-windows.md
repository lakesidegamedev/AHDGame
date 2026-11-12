---
date: 2026-11-08
title: "Court reversal recovery no longer double-credits or loses money"
summary: >-
  Two remaining gaps in recovering compensation after a Supreme Court reversal
  are closed: an interruption can no longer credit the treasury twice, and a
  spun-out company is covered from the moment the asset starts moving.
tags: [nationalization, supreme-court, economy]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The treasury credit for a recovered compensation is now applied at most once. If the game is interrupted right after the credit, resuming no longer pays the treasury a second time.
- When a reversed taking has no surviving former owner and the asset is spun out to a new company, the recovery is now recorded before the spin-out starts. An interruption between the spin-out and the record no longer loses the recovery.
