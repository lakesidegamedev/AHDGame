---
date: 2026-11-27
title: A bank closed by the double-counted bills bug is reopened
summary: The bank that was closed after its repaid bills were counted twice gets its charter, deposits and loans back.
tags: [banking]
badges: [patch]
areas: [backend]
---

## What changed

- The bank that was closed after its repaid government bills were counted twice is reopened with its deposits and loan book as they were.
- Its household depositors hand back the cash they were repaid and get their deposits back, so nobody is paid twice. Deposit insurance and the treasury get back what they paid out.
- Loan repayments collected while the bank was closed go back to the bank, and the game covers the remaining shortfall.
