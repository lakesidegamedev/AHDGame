---
date: 2026-11-08
title: "Take-private buyouts no longer pay funds and then fail"
summary: >-
  A company held by an index fund and a political party could pay the fund and
  then refuse to go private. It now goes to a vote instead. A stuck contract
  award is also released when the winning company disappears.
tags: [economy, corporations, fixes]
badges: [patch]
areas: [backend]
---

## What changed

- When a company's only outside holders include a political party alongside an index fund, the take-private now goes through the normal vote. Before, the fund was paid first and the buyout was then refused, leaving the company public.
- The buyout also checks every holder before moving any money.
- A government contract award stuck forever because the winning company no longer existed now reopens for other bids.
