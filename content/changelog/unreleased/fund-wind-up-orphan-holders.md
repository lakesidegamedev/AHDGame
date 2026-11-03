---
date: 2026-11-03
title: "Index funds no longer get stuck on holders that no longer exist"
summary: >-
  A deleted holder can no longer freeze an index fund. A wind-up pays everyone
  else and sends the missing holder's share to the central bank reserve, and a
  queued withdrawal nobody can receive is closed so the fund trades again.
tags: [index-funds, economy]
badges: [patch]
areas: [economy]
---

## What changed

- If a fund holder (an NPP, character or pension scheme) no longer exists, its share of the wind-up goes to the country's central bank reserve instead of blocking the whole wind-up.
- Every other holder is paid and the fund delists as normal.
- A queued withdrawal whose holder no longer exists is closed instead of being retried every turn, which used to stop the fund rebalancing.
