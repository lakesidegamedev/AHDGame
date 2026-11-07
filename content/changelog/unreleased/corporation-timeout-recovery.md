---
date: 2026-11-07
title: "Keep corporate income through turn timeouts"
summary: >-
  A corporation phase that finishes after a timeout retains its completed income
  result. Incomplete corporate processing stops the turn before dependent work.
tags: [economy, turns, recovery]
badges: [patch]
areas: [engine]
---

- Completed corporate income, including each character's per-currency income, is stored with phase completion and restored after a restart.
- A successful late completion can feed line-of-credit processing instead of discarding its income result.
- Retryable market failures retain their retry behavior, including failures that arrive after a timeout. Other corporate failures hold the turn for repair.
- A completed phase without a valid stored income result cannot resume using zero income. The repair command enforces the same requirement.
