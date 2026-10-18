---
date: 2026-10-17
title: Share equivalent display formatters
summary: >-
  Repeated money and exchange-rate displays now use shared helpers while
  preserving their existing precision, currency labels, and negative-value formatting.
tags: [maintenance, formatting]
badges: [patch]
areas: [frontend]
---

## What changed

- Consolidated matching cabinet, forex, central-bank, admin, party HQ, and ad amount formatters.
- Kept formatter variants separate where their precision, currency spacing, or sign placement differs.
