---
date: 2026-11-23
title: "Turns no longer stop over a rounding difference in company cash"
summary: >-
  The end-of-turn cash check now ignores rounding differences smaller than a hundredth of a cent,
  so large company balances no longer make a turn stop and retry.
tags: [turns, corporations, economy]
badges: [patch]
areas: [backend]
---

## What changed

- At the end of each turn the game checks that every company's cash change adds up to its new balance. On very large balances, ordinary computer rounding left a gap of about a millionth of a cent, and the check stopped the turn until an automatic retry finished it.
- The check now allows up to a hundredth of a cent. Any real mismatch is still caught.
