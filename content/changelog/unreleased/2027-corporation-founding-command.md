---
date: 2026-11-08
title: "Corporation founding moved into its own tested module"
summary: >-
  The steps that found a new corporation now live in one place with their own
  tests. Founding works exactly as before.
tags: [corporations, maintenance]
badges: [patch]
areas: [backend]
---

Founding a corporation still checks the same rules, charges the same amounts
and refunds you the same way if something goes wrong part way. The work behind
it is now easier to test directly, which makes future fixes to founding safer.
