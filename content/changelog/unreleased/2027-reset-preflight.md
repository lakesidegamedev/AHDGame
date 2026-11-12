---
date: 2026-11-09
title: "Safety check before the 2027 world opens"
summary: >-
  A read-only check now runs against a database before and after the 2027
  reset, so a broken start is caught before players see it. Nothing changes in
  running worlds.
tags: [world, reset]
badges: [patch]
areas: [backend]
---

## What changed

- Before the 2027 world opens, a check confirms every country that runs in full has positive state output and population, the seat numbers its elections need, and no leftover fields from older versions.
- The same check confirms the retired always-on switches are not set off, and that the price index starts fresh.
- It never writes anything and stops the launch if any check fails.
- Running worlds and other start dates are unchanged.
