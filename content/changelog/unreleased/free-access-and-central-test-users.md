---
date: 2026-11-13
title: Free access switch and per-account central login testers
summary: >-
  While the game is paused, the account service can open entry to every linked
  account. Separately, named test accounts can try the central sign-in path
  while everyone else stays on the current one.
tags: [auth, accounts, client]
badges: [patch]
areas: [backend]
---

## What changed

- The desktop account summary asks the account service for a public free access switch (cached for 60 seconds, 1.5 second timeout). When it is on, every linked account counts as entitled to singleplayer and the response carries `freeAccess: true`. A grant that exists only because of free access expires within one hour, so switching it off takes effect quickly even for offline clients. Real owners keep their normal offline grace. Any failure, a non-200 answer or an unreadable body counts as off.
- The sandbox link in the navigation also shows while free access is on.
- New optional `LAKESIDE_ACCOUNTS_URL` (default `https://lakesidegames.net`).
- New optional `AHD_CENTRAL_LOGIN_TEST_USERS`: comma-separated 24-character account ids. While the global mode is `shadow`, a sign-in by a listed account takes the central path (the central password check decides and the Lakeside session hop starts). Everyone else stays in shadow. It does nothing when the mode is `off`, and malformed ids are ignored. Credential writes still follow the global mode.

## Player-facing

Nothing changes until the switches are used. When free access is on, linked accounts can enter without owning the game.
