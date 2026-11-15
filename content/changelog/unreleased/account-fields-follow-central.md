---
date: 2026-11-13
title: Email and password follow the central Lakeside account
summary: >-
  When switched on, A House Divided stops editing email and password itself
  and follows changes made at the Lakeside account. Off by default.
tags: [accounts, security]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- New switch `AHD_ACCOUNT_FIELDS_MODE` with three settings: `off` (today's
  behaviour, the default), `freeze` and `central`.
- In `freeze`, the forgot password, reset password, change email and change
  password screens say account details are moving and will be back in a few
  minutes. Their APIs refuse writes with a 503 and the same wording.
- In `central`, those screens point to the Lakeside account instead, and the
  APIs refuse writes with a 409 that includes the account link. The settings
  page explains that a password change at the Lakeside account applies in every
  Lakeside game.
- In `central`, the web process polls the account changes feed every 10
  seconds and applies email changes (keeping the old address in
  `emailHistory`) and password changes (the local password copy is cleared and
  `passwordSupersededAt` is set). One poller runs at a time, using a 30 second
  lease and a stored cursor.
- An account whose password moved is refused with "Sign-in is temporarily
  unavailable" when the central check cannot answer, instead of falling back
  to an old local copy.
- Admins can read `/api/admin/account-fields` for the mode, feed cursor, last
  poll, last error and the number of accounts with no local password.
