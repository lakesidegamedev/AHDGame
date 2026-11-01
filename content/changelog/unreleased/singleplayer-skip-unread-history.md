---
date: 2026-11-02
title: Singleplayer turns skip records nobody can see
summary: >-
  Singleplayer worlds no longer write audit trail and research rows that only
  hosted staff can open. Turns finish sooner and your game looks the same.
tags: [singleplayer, performance, turns]
badges: [patch]
areas: [backend]
---

Each turn used to save thousands of background records meant for hosted staff:
the action audit trail, the research export rows, and a few money records for
party dues, company revenue, company tax and bank loan interest that no screen
or rule reads back.

A singleplayer world now skips those. Everything you can see or use is kept,
including your transaction history, bond and fund history, tax and income
records, and the money ledger the economy checks run on.

Turns produce the same results as before, just sooner. Hosted games are not
affected.
