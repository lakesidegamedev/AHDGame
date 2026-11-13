---
date: 2026-11-13
title: "Old-world repair recipes no longer act on a new world"
summary: >-
  Repair recipes that settle a past incident can now be tied to the worlds
  that existed before a date. In a later world they report nothing to repair
  and refuse to run, so a reset cannot turn an old refund into new money.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- A repair recipe can declare `worldsStartedBefore`. When the current world began on or after that date, the recipe reports 0 rows, gets no approval token and refuses to apply.
- The Vermont Finance bank refund, the freight overbilling refund and the whole-plants conversion are tied to worlds started before 2026-11-12. The 2027 world does not owe the two refunds, and its companies already hold leftover part-plants as construction credit.
