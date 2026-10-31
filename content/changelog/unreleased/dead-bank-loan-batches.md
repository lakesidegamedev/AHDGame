---
date: 2026-10-27
title: Loans owed to failed banks settle faster
summary: >-
  Household loan tranches and construction loans owed to banks that have
  failed now settle in one or two batches per bank instead of one at a time.
  Payments, arrears and recoveries are unchanged.
tags: [performance, banking, turn]
badges: [patch]
areas: [engine]
---

A failed bank's household tranches join its batched loan servicing with one
combined draw on the household pool, and its construction loans take their
lease and lock once per bank. A short household pool is now drawn down tranche
by tranche, where previously a second tranche could fail the banking step.
