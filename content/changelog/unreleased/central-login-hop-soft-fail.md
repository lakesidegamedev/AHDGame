---
date: 2026-11-13
title: Central session hop fails soft and follows every sign-in method
summary: >-
  Only active when central login is switched on. If the central issuer is down
  during sign-in, players now land on their normal page, signed in, instead of
  a browser error page.
tags: [auth, accounts]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- New `GET /api/auth/lakeside-hop/ready` route (no sign-in needed, never cached). It probes the issuer's discovery document with an 800 ms timeout, caches the answer in-process for 10 s, and reports not ready while the bridge breaker is open.
- The login page asks it before following the hop (1500 ms limit). If the check fails, times out or says not ready, the page goes to the normal destination. The player is signed in either way.
- Apple, Google and Discord sign-in make the same readiness check on the server and fall back to the plain redirect when the issuer is not ready. Linking a provider to a signed-in account never hops.
- Skipped hops are recorded as `hop` events with reason `hop_issuer_not_ready`.
- Modes `off` and `shadow` are unchanged and make no new network calls.

## Player-facing

Nothing changes unless central login is on. When it is, a central outage no longer interrupts sign-in.
