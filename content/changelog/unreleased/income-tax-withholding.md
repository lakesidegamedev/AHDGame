---
date: 2026-10-31
title: Settle income taxes before payouts
summary: >-
  Salary, dividends and interest settle current taxes and eligible outstanding
  tax debts before the remaining money becomes spendable. Corporate receipts
  also settle taxes and payables before optional spending.
tags: [economy, taxes, corporations]
badges: [patch]
areas: [backend, engine]
---

## What changed

- Current income tax is collected with covered salary, dividend, bond-coupon and savings-interest payments.
- Eligible outstanding taxes receive partial repayments from income after current withholding, with unpaid balances retained for later payments.
- Bond principal remains protected, and already-taxed pass-through distributions avoid a second personal levy.
- Corporate receipts reserve current taxes and settle old payables before discretionary spending and distributions. Configured CEO salary is retained during an arrears-related pause.
- Required transactions and recovery receipts prevent a retried income payment from collecting or paying money twice.

- Share splits wait for pending issuance to finish. Dividend allocations stay within the corporate payout pool even when saved IPO inventory is stale.
