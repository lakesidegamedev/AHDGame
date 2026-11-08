---
date: 2026-11-08
title: "Crisis decisions can no longer be paid or applied twice"
summary: >-
  Fast double clicks, simultaneous contributions and aid pledges in a crisis
  now count once. A crisis that fails to close no longer holds up the others
  that expire in the same turn.
tags: [crises, fixes]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Contributing to a shared crisis fund claims your slot first, so two contributions at once no longer erase each other and a double click cannot charge your treasury twice. If the payment fails, the slot is released.
- Choosing an option or declining aid is claimed before any cost, effect, bill or court case follows, so a double click runs it once.
- An aid pledge now reserves your country's pledge before spending or applying anything.
- A crisis whose shared response fails to resolve stays open and retries next turn, while other expiring crises close as normal.
- A crisis decision whose step has vanished from its tree now closes as unanswered instead of getting stuck, and one broken decision no longer stops the rest from resolving.
- Treasury spending now adjusts the balance in place instead of writing back a stale total.
