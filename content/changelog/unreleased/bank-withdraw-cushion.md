---
date: 2026-11-02
title: Banks can no longer withdraw money they do not have
summary: >-
  A bank's maturing treasuries were briefly counted twice, which could show
  far more free to withdraw than the bank really had. Withdrawals now also keep
  enough capital for the bank to stay healthy.
tags: [banking, economy, corporations]
badges: [patch]
areas: [backend, frontend, engine]
---

## What changed

- When a treasury bond a bank holds matures, the bank is re-valued straight
  away. Before, the repayment landed in the bank's cash while the matured bonds
  still counted on its books until the next turn, so the same money showed up
  twice. During that window the bank looked healthier than it was and offered
  far more under Free to withdraw than it really had.
- Free to withdraw now keeps the capital the bank needs to stay adequate: at
  least 8% of its loans and treasuries, and enough to pass the stress scenario.
  Before, it allowed everything above zero, so a small fall in bond prices on
  the next turn could close the bank.
- The withdraw control explains that bonds are re-priced every turn and that a
  payout close to the limit leaves little room, and the warning turns amber
  when you enter most of the limit.
