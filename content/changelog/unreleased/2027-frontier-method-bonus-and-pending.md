---
date: 2026-11-10
title: "Frontier race methods now add real output, and unpaid points cannot win"
summary: >-
  A held frontier method now adds its output bonus on top of the normal tech cap
  instead of being swallowed by it, and points that have not been paid for yet
  cannot make an entrant the winner.
tags: [research, corporations, economy]
badges: [patch]
areas: [engine, backend]
---

Corporations deep in the late-game tech tree were already at the plant output
cap, so a method won in a frontier race added nothing. Methods now count as
their own capped bonus on top of it. Funding points are also held aside until
the payment goes through, so an entrant whose payment fails is never crowned.
