---
date: 2026-10-26
title: Turns read only the fields they use
summary: >-
  Payment status checks, payment resumes and corporation loads in the turn
  stop pulling large history fields they never read. No gameplay change.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

## What changed

- Checks for whether a payment already happened now read a few hundred bytes
  instead of the whole payment record, which averages about 97 KB.
- Corporation loads in several turn phases skip the long list of settled
  payment keys, about two thirds of each corporation record.
