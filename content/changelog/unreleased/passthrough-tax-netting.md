---
date: 2026-11-17
title: "Pass-through owner tax now nets losses against bond interest"
summary: >-
  LLCs, LLPs and S-corps taxed through their owners no longer pay tax on bond
  interest when their operations lost money that turn. The two are netted first.
tags: [corporations, tax]
badges: [patch]
areas: [engine, backend]
---

## What changed

For pass-through companies taxed through their owners, an operating loss now
offsets bond interest income in the same turn. Before, the loss was ignored and
the interest was taxed in full. The income statement preview uses the same rule.
