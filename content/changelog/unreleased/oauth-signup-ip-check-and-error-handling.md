---
date: 2026-11-08
title: "Sign-in fixes for Discord and Google"
summary: >-
  New Discord accounts now get the same network check as Google and Apple
  sign-ups, and a failed Discord or Google sign-in now shows the normal
  error page instead of failing silently.
tags: [accounts, security]
badges: [patch]
areas: [backend]
---

## What changed

- Creating a new account with Discord now runs the same network check that Google and Apple sign-ups already ran, when that check is switched on.
- If something goes wrong while signing in with Discord or Google, you now land on the usual sign-in error page instead of a broken response.
