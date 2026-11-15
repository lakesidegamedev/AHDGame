---
date: 2026-11-13
title: Only admins can change site controls
summary: >-
  Pausing or resuming turns, pausing corporation actions, closing registration
  and switching the IP collision check now need an admin on the server, as the
  Control panel intends.
tags: [security, admin]
badges: [patch]
areas: [backend]
---

## What changed

- Starting and stopping the turn system, toggling corporation actions, and changing registration or the IP collision check now check for an admin. Moderators and junior devs receive a refusal.
- Moderators can still see the current status of each setting, without the change buttons.
- The list of character balances used by the grant tool is now admin-only.
