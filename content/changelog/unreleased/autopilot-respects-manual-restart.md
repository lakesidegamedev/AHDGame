---
date: 2026-11-06
title: "Autopilot leaves a sector you restarted running"
summary: >-
  When you reactivate a parked sector by hand, autopilot no longer parks it
  again on the next turn. It stays hands-off for 24 turns.
tags: [corporations, autopilot]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- A corporation on autopilot used to park the sector you had just restarted on the very next turn, because its run of losing turns was never cleared. Restarting a sector yourself now clears that count and the count of turns with no sales.
- After a manual restart, autopilot will not park that sector for 24 turns, whatever the reason: a glutted market, a plant stuck at its demand floor, or a long run of losses. You can still park it yourself at any time.
- The sector page shows "Autopilot will leave this sector running until turn N" while the hold is active.
- AI companies and corporations without autopilot are unchanged.
