---
date: 2026-10-24
title: A deleted holder no longer freezes a fund's wind-up
summary: >-
  A winding-down fund used to stop dead when one holder record was missing,
  blocking payment to everyone else. The unpayable share now goes back to the
  fund's sponsor with the rest of the remaining cash.
tags: [funds, payout, fix]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A holder whose record no longer exists is skipped when a winding-down fund
  pays out. Their share stays in the fund and is returned to the sponsor with
  the other remaining cash, instead of halting every payment.
- The fund's completion record lists each unpayable claim with its units and
  amount, so the loss is visible rather than silent.
