---
date: 2026-11-20
title: "State bills that fund themselves can be signed"
summary: >-
  A state bill that raises a tax and spends the money is no longer refused at
  signing for lack of funding headroom.
tags: [legislature, budget]
badges: [patch]
areas: [backend]
---

When a governor signs a state bill, the funding check now counts the extra
yearly revenue from tax rate changes inside the same bill. Before, a bill that
raised a tax by more than it spent was still refused if the state had already
spent all of its current revenue. A tax cut does not add headroom.
