---
date: 2026-11-21
title: Recover interrupted corporation production safely
summary: >-
  Interrupted company turns resume their frozen settlement before preparing
  another market. Excluded empty entrants retain their paid construction, and
  historical earnings keep their recorded value when currencies change.
tags: [corporations, economy, bugfix]
badges: [patch]
areas: [backend, engine]
---

## What changed

- Resume frozen production and closing bookkeeping without preparing, funding or paying the market again.
- Preserve frozen rates, buyer scopes and host accounting facts for repeatable recovery.
- Admit receipt-excluded empty entrants on their real opening generation so construction catches up without wiping stock or rebasing paid work.
- Keep current-turn paid construction intact during catch-up, including financing references.
- Count zero-sales streaks once and reload authoritative company cash after returning state advances.
- Use recorded anchor values for historical taxable earnings instead of requiring rates for retired currencies. Current corporate payouts retain the world preset's currency.
