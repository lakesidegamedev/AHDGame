---
date: 2026-11-07
title: "Opening a savings account no longer fails when its record went missing"
summary: >-
  A savings account whose setup was already recorded but whose account record
  was missing could not be opened and kept returning an error. It is now
  recreated on the next open.
tags: [banking, savings]
badges: [patch]
areas: [backend]
---

## What changed

- Opening a savings account in a currency whose setup receipt was already applied, but whose account record was missing, replayed the receipt, inserted nothing and answered with a retry error every time.
- The account is now rebuilt from its own receipt, with the same balance and holder it was set up with, and the open or deposit continues.
- Nothing is booked twice: the bank and central bank totals recorded by the original setup are left as they were.
