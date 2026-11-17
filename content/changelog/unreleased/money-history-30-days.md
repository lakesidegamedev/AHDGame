---
date: 2026-11-17
title: "Money history is kept for 30 days"
summary: >-
  Transaction records are now kept for about 30 days instead of 7, so support
  can trace where money went for a full month.
tags: [support, transactions]
badges: [patch]
areas: [backend]
---

## What changed

- Transaction, treasury and index fund records are kept for 720 turns (about 30 days at hourly turns) instead of 168. Bond history on company pages now reaches back the same 720 turns.
- Older records are still cleaned up after that, so the game database stays a bounded size.
