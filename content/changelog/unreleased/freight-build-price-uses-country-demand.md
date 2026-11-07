---
date: 2026-11-07
title: "Freight and construction build prices compare against your whole country's demand"
summary: >-
  The extra build price on freight and construction no longer measures your
  fleet against one small state. It measures it against demand across the
  country, where those services actually sell.
tags: [economy, corporations]
badges: [patch]
areas: [fullstack]
---

## What changed

- Freight and construction services sell anywhere inside their own country, but the build price's "share of world demand" compared your capacity in one state with that state's demand alone. In a small state such as Arizona an ordinary logistics arm read as about four times the market and picked up a build price multiplier of 45.
- The comparison now uses your capacity in the country against the whole country's demand for the product, for player and AI companies alike.
- Healthcare and real estate services still compare against the state they are built in. If a country has no demand reading, the old state reading is used.
