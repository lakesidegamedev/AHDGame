---
date: 2026-10-31
title: Government budgets can collect taxes and pay debts in real money
summary: >-
  New, switched-off steps let governments collect real taxes from households,
  pay for public purchases from their own cash, and pay bondholders. Players
  holding government bonds are paid in full and first. Nothing changes until
  the steps are switched on.
tags: [economy, budget, bonds]
badges: [patch]
areas: [backend]
---

## What changed

- A government can collect a share of its book taxes, sized to the real
  economy, from households into its treasury, never more than a tenth of
  household cash in one turn.
- Public purchases can be paid from treasury cash instead of created fresh,
  and unspent money goes back to the treasury.
- Bond interest owed to players is paid at full value and before anyone
  else. Interest owed to the market and to funds is paid at the scale of the
  real economy, oldest first, so long unpaid interest starts clearing.
- Countries without a real economy of their own use the middle value of the
  other countries' scales for their debts.
- Clearing old unpaid interest is limited per turn so the hourly turn stays
  fast, and interest owed to companies is paid in one combined payment.
- When a government bond matures, the market's share is repaid at the same
  scale the market paid for it, so the bond market neither drains nor grows
  from government refinancing. Players are still repaid in full.
- Household taxes are collected in one batch per country, which keeps the
  hourly turn fast.
