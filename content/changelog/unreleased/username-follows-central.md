---
date: 2026-11-14
title: Usernames follow the central Lakeside account
summary: >-
  When switched on, a username change made at the Lakeside account shows up in
  A House Divided everywhere the player is named. Off by default.
tags: [accounts]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- New switch `AHD_USERNAME_MODE`: `off` (today's behaviour, the default) or
  `central`.
- In `central`, the account changes feed also carries username changes. The
  sign-in name and display name are updated, and the earlier name is kept in
  `usernameHistory`. A name already held by another account is refused and
  recorded as a feed error. Replays change nothing.
- Names of any length keep working, including older 2 and 22 character names.
- Settings shows "formerly <old name>" for 30 days after a rename, and a link
  to change the username at the Lakeside account.
- `/api/auth/me` reads the username from the account, not the sign-in token,
  so a rename shows without signing in again.
- Logs, tickets and other records keep the name written at the time.
- The admin account-fields monitor reports the username mode and the number of
  renames in the last 30 days.
