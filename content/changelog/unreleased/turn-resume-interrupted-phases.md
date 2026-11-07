---
date: 2026-11-07
title: "Turns no longer skip the economy after a mid-turn restart"
summary: >-
  If the turn engine is restarted while company profits are being calculated,
  the turn now stops and waits for a repair instead of finishing without them.
tags: [turns, economy]
badges: [patch]
areas: [engine]
---

## What changed

- A restart in the middle of the company economy step used to be treated as if that step had finished, so a turn could complete with every company's profit for that turn missing.
- The turn now refuses to continue in that case and is held for a repair, so no one loses a turn of profit without it being noticed.
- Any other step that was cut off by a restart is now shown as failed in the turn record, not as already applied.
