---
date: 2026-10-27
title: Governments refinance maturing bonds instead of leaving holders unpaid
summary: >-
  When a government cannot pay a maturing bond from its cash, it now sells new
  bonds to the market and pays every holder on time. Bonds that were stuck past
  maturity are paid on the next turn.
tags: [economy, bonds, banking]
badges: [patch]
areas: [backend, engine]
---

## What changed

- A government short of cash at a bond's maturity now refinances it the way a
  real treasury does: it sells a new bond to the bond market for the cash it
  lacks and pays the maturing holders in full. Index funds, NPPs, companies,
  players and banks are all paid principal on time. The bond market's own
  holding is still exchanged for new bonds rather than cash.
- Refinancing replaces maturing debt and never adds to it, so it is not limited
  by the debt ceiling. The new debt can never exceed the face of the bond being
  repaid.
- If the bond market has no cash that turn, the bond stays due and is retried
  the next turn. It is never marked as a default.
- A failed bank whose depositors are still being resolved now receives its
  matured government bond principal into its estate. Before, the payment waited
  for the estate to close while the estate waited for the bond, so neither
  finished.
- A failed bank's estate no longer tries to sell a bond that is already being
  repaid at maturity, which was blocking the estate from closing.
- Bonds already past maturity and unpaid in several countries are refinanced
  and paid on the first turn after this ships.
