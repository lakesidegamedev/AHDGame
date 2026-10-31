---
date: 2026-10-28
title: Funds finish winding up when their sponsor is gone
summary: >-
  An index fund whose sponsor corporation, or a corporation that held units in
  it, was deleted now finishes winding up instead of retrying every turn. Cash
  with no owner left goes to the fund country's central bank reserve.
tags: [index-funds, corporations, turn]
badges: [patch]
areas: [engine]
---

A winding-down fund no longer stalls when the corporation behind a payout no
longer exists. Any slice with no surviving owner escheats to the fund country's
central bank reserve with a ledger record, the same destination unowned equity
already takes when a corporation dissolves.
