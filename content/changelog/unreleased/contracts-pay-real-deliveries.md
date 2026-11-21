---
date: 2026-11-21
title: Supply contract prices apply only to goods actually delivered
summary: >-
  A supply contract's agreed premium or discount is now paid only on goods the
  market actually delivered from the supplier to the buyer, not on an assumed
  delivery. Shortfall damages are unchanged.
tags: [economy, corporations, contracts]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- Each turn, a supply contract's premium or discount is worked out from what
  the supplier really sold to the buyer that turn, up to the contract's volume.
  Before, it was worked out from a delivery the market assumed, which was often
  far more than the buyer received.
- A contract whose two companies did not trade with each other in a turn pays
  no premium or discount that turn.
- When one supplier has several contracts with the same buyer for the same
  good, what was delivered is shared between them by contract size.
- Shortfall damages still depend on what the supplier produced, as before.
- The contract panel's "Last delivery" figure is the same number the payment
  used. When the market delivered less than the contract volume, the panel says
  so.
- Earlier turns are not recalculated.
