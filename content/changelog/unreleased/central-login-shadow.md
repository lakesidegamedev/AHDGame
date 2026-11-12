---
date: 2026-11-12
title: Central account login switch (dark, default off)
summary: >-
  Groundwork for signing in through one shared Lakeside account. Nothing
  changes for players yet: the switch ships off, and sign-in, registration and
  password handling behave exactly as before.
tags: [auth, accounts, groundwork]
badges: [patch]
areas: [backend]
---

## What changed

- New switch `AHD_CENTRAL_LOGIN_MODE` with `off` (default), `shadow` and `central`. Any other value is treated as `off`, and a switched-on mode with no bridge configuration also behaves as `off`.
- A small client for the central account bridge: client-credentials token with caching, a strict timeout (default 2000 ms), typed results, and errors reduced to `error` or `timeout` so no body, password, hash or email is ever logged.
- Shadow mode: the local decision stays authoritative. After it settles, password logins are compared with the central answer off the response path and written to `centralLoginShadowEvents`. Apple, Google and Discord logins record a skipped comparison. Register, change, set and reset password, email confirmation, provider unlink and account delete are mirrored best effort.
- Central mode: password login asks the bridge first with `enforceEnabled`. Only `ok` signs in; `wrong`, `disabled` and `unknown` reject like a wrong password and never fall back. `error` and `timeout` fall back to the local check and record a fallback event. Credential writes reach the central system first and refuse with a try-again error if it is unreachable; the local copy is then updated, so returning to `off` needs no copy-back.
- Passwords of 72 UTF-8 bytes or more cannot be held centrally. Shadow and central login check them locally only, record a `long_password` event (counted separately, never as a mismatch) and make no bridge call. In shadow and central mode, new passwords of that length are refused at register, change, set and reset with "Use a password under 72 bytes"; mode `off` keeps today's rule.
- Apple, Google and Discord sign-up and provider linking are mirrored: shadow mode best effort, central mode creates or updates the central account first and refuses with a try-again error if it is unreachable.
- Central mode: when the local write fails after the central write landed (race or database error) on change, set and reset password, email confirmation, provider link and unlink, the central account is restored to its previous state and an event is recorded.
- Account updates send only the fields they change, so provider ids are never cleared by accident.
- `summarizeShadowEvents` returns match, mismatch, error, timeout, fallback and long-password counts over a window, for a later admin view. No UI added.
- New collection `centralLoginShadowEvents` with indexes on `at` and on `match`. It is preserved across world resets.

## Player-facing

Nothing changes yet. Players sign in, register and manage passwords exactly as before.
