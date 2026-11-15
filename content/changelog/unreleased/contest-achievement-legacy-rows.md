---
date: 2026-11-15
title: Contest achievements no longer stall on older awards
summary: >-
  Contest achievements earned before awards were tied to accounts no longer
  block new ones. Every turn's contest achievement check now completes for
  everyone.
tags: [contests, achievements]
badges: [patch]
areas: [engine]
---

## What changed

- An award recorded before achievements carried an account is now treated as
  already earned and linked to the account, instead of colliding with the new
  record and failing the whole contest achievement pass for that turn.
