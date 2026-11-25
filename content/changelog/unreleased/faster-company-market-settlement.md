---
date: 2026-11-25
title: "Company market settles faster each turn"
summary: >-
  The company market step of the hourly turn does the same work with less
  computing, so turns finish sooner. Every trade, price and balance is unchanged.
tags: [performance, turns, economy]
badges: [patch]
areas: [backend]
---

The company market step of the hourly turn clears the market several times while
plants settle on how much to make. Each clearing now reuses the parts of the
order book that do not change between clearings, and the turn's own record of
who sold to whom is rebuilt with less work. In replays of recorded turns, every
trade, price and receipt matched the previous code exactly.
