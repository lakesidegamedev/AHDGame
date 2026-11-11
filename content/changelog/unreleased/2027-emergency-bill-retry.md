---
date: 2026-11-11
title: "A passed emergency bill waits for funds instead of vanishing"
summary: >-
  If the treasury cannot pay for a passed crisis emergency bill, the response
  is tried again next turn instead of being lost.
tags: [engine]
badges: [patch]
areas: [backend]
---

## What changed

- A passed emergency bill that cannot be paid is retried on later turns while the crisis is still running.
- The crisis ledger no longer shows nothing for that response.
