---
date: 2026-10-21
title: Closing funds pay out queued withdrawals
summary: >-
  A fund that is winding down now pays the withdrawals still waiting in its
  queue and then finishes closing, instead of staying stuck.
tags: [economy, funds]
badges: [minor]
areas: [engine]
---

## What changed

- A winding-down fund with only cash left now pays its queued withdrawals, priced on the cash it actually holds, so queued holders and remaining holders get the same price per unit.
- Once the queue is empty the fund closes and pays its remaining holders as before.
- Funds still selling shares or bonds keep their queue until those sales finish.
