---
date: 2026-11-17
title: Faster index fund redemption recovery check
summary: >-
  The hourly index fund pass no longer scans every past redemption to find
  payouts that need recovery. No payout amounts or timing change.
tags: [index-funds, performance]
badges: [patch]
areas: [backend]
---

## What changed

- Looking for unfinished redemption payouts each turn used to read the whole
  redemption history, which grows every turn. It now reads only the unfinished
  rows.
- Results and payouts are identical; only the lookup is cheaper.
