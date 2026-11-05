---
date: 2026-11-05
title: Sites with construction loans can now change hands
summary: >-
  A site built with a secured construction loan no longer freezes its owner in
  place. Acquisitions, takeovers, spin-offs and state takings now carry the loan
  to the new owner, who keeps repaying the bank.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, banking, nationalization]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend]
---

## What changed

- A site financed by a secured construction loan used to block almost every
  ownership change until the loan was fully repaid, which could take up to 120
  turns.
- Agreed acquisitions, hostile takeovers and subsidiary spin-offs now go
  through. The loan moves with the site and the new owner becomes the borrower,
  repaying it from its own cash each turn. The bank keeps its loan and its claim
  on the site.
- Nationalizing a sector or a whole corporation, splitting off or merging back a
  National Corporation, and reabsorbing an unsold privatization work the same
  way: the National Corporation that receives the site takes on its loan.
- Selling a site on the market already worked and still does: the buyer's
  payment repays the bank first and the seller gets the rest.

## What still waits for the loan

- A financed site cannot be merged into another site the new owner already runs
  in the same market.
- The new owner must keep its cash in the loan's currency.
- Dissolving a corporation, moving it to another currency, privatizing a
  financed site and merging countries still wait until the loan is repaid or
  the site is sold, because none of them leaves anyone to repay the bank.
- Sites whose loan is in default, still waiting on the bank, or in the middle of
  a payment, sale or refund also wait.
