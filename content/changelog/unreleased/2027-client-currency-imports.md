---
date: 2026-11-10
title: "Pages import currency symbols from a small module"
summary: >-
  Screens that only show a currency symbol or a country's currency no longer pull
  the exchange rate tables into the browser download.
tags: [performance, currencies]
badges: [patch]
areas: [frontend]
---

Forty screens that only needed a currency symbol, a country's currency or the list
of tradeable currencies now import them from a small module instead of the full
exchange rate tables, which reach into every country's economy data. Nothing
changes on screen. A test now fails if a browser module imports the large file for
names the small one provides.
