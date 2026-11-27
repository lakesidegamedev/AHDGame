---
date: 2026-11-27
title: A bank's automatic bill buying can no longer sink it
summary: Automatic investing in government bills now stops before the purchase would leave the bank owing more than it is worth.
tags: [banking]
badges: [patch]
areas: [backend]
---

## What changed

- Government bills are bought at the asking price and valued at the lower price a buyer would pay, so every purchase costs a bank a little of its net worth on the day it buys.
- A bank's automatic investing now limits each turn's purchases so that cost can never take the bank's assets below what it owes. A bank with nothing to spare keeps its spare cash as cash until it has some.
- Bills you buy by hand are unchanged.
