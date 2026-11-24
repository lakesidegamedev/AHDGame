---
date: 2026-11-24
title: "Idle plants with a thin profit margin can restart again"
summary: >-
  A plant that sat idle with no cash and no recent sales now tries a small
  restart run whenever it would make any profit at today's prices.
tags: [corporations, production, economy]
badges: [patch]
areas: [engine]
---

A plant that sits idle with no cash and nothing sold last turn can try a small
restart run, paid for by what that run sells. It used to try only when the run
looked at least about 10% profitable at today's market prices, so a plant with a
thinner margin stayed idle for good. It now tries whenever the run would make
any profit at all.

Once the restart run sells, the plant has a sales record, and from the next turn
it runs at full output as long as its sales cover its costs. Plants that would
lose money at today's prices still stay idle.
