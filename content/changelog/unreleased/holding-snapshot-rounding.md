---
date: 2026-10-31
title: Portfolio history no longer stops on large new stock holdings
summary: >-
  A rounding difference on a large portfolio of recently bought shares could
  stop the portfolio history step for a turn. It now records normally.
tags: [stocks, portfolio]
badges: [patch]
areas: [backend]
---

## What changed

- The turn's portfolio history step allows tiny rounding differences when it
  splits a large holding into short and long term value.
