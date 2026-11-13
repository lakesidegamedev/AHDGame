---
date: 2026-11-13
title: Central login keeps both copies in step when two password changes race
summary: >-
  With central login switched on, two password changes landing at the same
  moment could leave the central account on the old password while the game
  kept the new one. The central account now follows whichever change won.
tags: [auth, accounts]
badges: [patch]
areas: [backend]
---

## What changed

- When a credential write loses a race locally after the central write landed, the central account is restored from the account as it is now, re-read at that moment, instead of from the snapshot the losing request started with. The winning change is what both copies hold.
- Applies to change, set and reset password, email confirmation and provider link and unlink. Nothing changes while central login is off or in shadow mode.
