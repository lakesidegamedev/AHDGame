---
date: 2026-11-13
title: "Login and sign-up pages load sooner"
summary: >-
  The device check on the login and sign-up pages now starts when you first
  touch the page instead of while it is loading.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The device check code is no longer part of the first download of the login and sign-up pages.
- It starts on your first tap or key press, or after a few seconds, and signing in waits for it if needed.
