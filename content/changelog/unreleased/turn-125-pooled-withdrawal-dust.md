---
date: 2026-11-22
title: "Turns no longer stop on a rounding gap in market sales"
summary: >-
  A sale that asked for a hair more stock than the market held, because of
  rounding, could stop the whole turn. It now takes what is there.
tags: [market, turns]
badges: [patch]
areas: [backend]
---

## What changed

- When rounding made a market purchase ask for a tiny fraction more stock than sellers held, the turn stopped. The purchase now takes the full stock instead. A real overdraw still stops the turn.
