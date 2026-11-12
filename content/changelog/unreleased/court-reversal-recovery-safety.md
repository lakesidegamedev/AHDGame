---
date: 2026-11-08
title: "Court reversals recover compensation reliably"
summary: >-
  When the Supreme Court strikes down an emergency taking, the compensation the
  government paid is now recovered even for whole-company takings, for sectors
  taken more than once, and after an interruption mid-recovery.
tags: [nationalization, supreme-court, economy]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Whole-company takings now record the buyout against each sector the state kept, so a court reversal can claw it back from whoever ends up holding the asset.
- A sector that was taken more than once keeps a record of every taking. A reversal hands each one back in turn and recovers each compensation, instead of seeing only the latest.
- Recovering compensation is now written down before any money moves and finished afterwards. If the game is interrupted part-way, the recovery resumes on the next court turn instead of being lost.
- Corporate bond defaults, restructures and refinances now stop with an error if a bank treasury ever holds one of those bonds, rather than silently skipping the bank. Banks cannot hold corporate bonds today.
