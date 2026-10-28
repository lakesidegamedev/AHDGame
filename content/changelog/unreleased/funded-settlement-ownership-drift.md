---
date: 2026-10-27
title: Funded turns finish when a company changes hands mid-turn
summary: >-
  A spin-off, sale or takeover during a funded producer turn no longer stops the turn. The company
  that owned the plant when the turn was planned is paid for that turn; the new owner takes over next turn.
tags: [economy, corporations]
badges: [patch]
areas: [backend]
---

## What changed

- Producer settlement no longer refuses a sector whose owner changed after the turn froze. Cash books to the frozen owner and the sector keeps its physical receipt, keyed by sector id.
- If the frozen owner was dissolved and all its sectors moved to one settling company, that company receives the turn's cash; otherwise the turn still stops.
- Company cash moves by the turn's change with an overdraft check, instead of requiring the exact opening balance, so a player spending company cash during the turn cannot strand it.
- Each ownership drift is recorded as a settlement warning on the producer turn record.
