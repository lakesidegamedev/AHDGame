---
date: 2026-11-03
title: Bond coupon tax shown under federal tax
summary: >-
  The Financials tab now shows how much of a corporation's federal tax is
  charged on coupons from bonds it holds, so the tax line no longer looks too
  high against operating profit.
tags: [corporations, taxes, bonds]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- Under Federal tax, a new indented line shows the part charged on bond coupon
  income at the home country's rate. The coupon income itself is listed further
  down under interest and investment income.
- The federal tax tooltip now says it includes that coupon tax.
