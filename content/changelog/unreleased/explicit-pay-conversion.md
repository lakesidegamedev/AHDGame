---
date: 2026-10-30
title: Paying in another currency no longer strands your money
summary: >-
  Buying a bond, shares or a fund with a different currency could convert
  your money, then fail by a rounding gap and leave you holding the foreign
  currency after paying the conversion fee. The conversion now always covers
  the price, and a purchase that fails gives the conversion back.
tags: [economy, forex, bonds, shares, funds]
badges: [patch]
areas: [backend]
---

## What changed

- When you pay in one currency for something priced in another, the game now
  converts enough to cover the full price. Before, rounding in the conversion
  fee could leave you a few units short, so the purchase failed after the
  conversion had already happened.
- Only the part you are missing gets converted. If you already hold some of
  the target currency, that is used first and you pay the fee on less.
- Position limits are checked before any money is converted, so a purchase
  that was never allowed cannot cost you a fee.
- If a purchase still fails after converting, the conversion is reversed: you
  get back exactly what you spent, fee included, and the currency you received
  is taken back. It shows in your currency history as a purchase refund.
