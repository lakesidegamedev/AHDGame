---
date: 2026-11-09
title: "A refused construction instalment no longer freezes the lender's whole construction book"
summary: >-
  When one borrower could not cover a construction instalment, the lender's other
  construction loans stayed locked and sales of financed sectors were refused.
  The batch now completes without that one payment.
tags: [banking, construction]
badges: [patch]
areas: [engine]
---

## What changed

- If one borrower's construction instalment was refused because their cash had moved, the lender's batch for that turn could never finish. The lender's whole construction book then stayed locked, and selling or cancelling a financed sector was refused.
- Recovery now finishes the batch without the refused payment. The lender is credited only the instalments that were actually taken, and the loans of the borrowers who paid move forward.
- The refused borrower's loans are not advanced and are serviced normally on a later turn, so nobody is charged twice.
- The lender's lock and the loans' locks are then released.
