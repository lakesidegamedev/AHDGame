---
date: 2026-10-24
title: Unpaid income tax is collected from your other currency wallets
summary: >-
  An income-tax bill your assessed wallet could not cover used to stay unpaid
  forever. Collection now takes the rest from your other personal currency
  wallets at the current market rate.
tags: [economy, tax, forex]
badges: [patch]
areas: [backend]
---

## What changed

- Income-tax settlement still pays the assessed wallet first. When that wallet
  is short, the remainder is bought from the payer's other personal currency
  wallets at the live market rate, in the same rate direction the assessment
  itself uses.
- Converted debits are charged in whole cents or yen, and the tiny rounding
  excess is retired rather than left owing forever.
- Savings wallets are never touched. A payer with no money in any personal
  wallet still keeps the debt.
