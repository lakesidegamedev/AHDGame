---
date: 2026-10-27
title: Government budget processing reads far less each turn
summary: >-
  The turn's government budget step no longer reads every unpaid bond coupon
  in full, and prepares coupon payments for all countries at once instead of
  one country at a time. Coupons paid and owed are unchanged.
tags: [performance, treasury, bonds, turn]
badges: [patch]
areas: [engine]
---

Coupon claims are read with only the fields settlement needs, the open queue
is walked through an index, and payee checks, claim marks and close-outs run
once per turn for every country.
