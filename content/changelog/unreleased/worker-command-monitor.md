---
date: 2026-10-27
title: Turns spend less time on database bookkeeping
summary: >-
  The turn processor no longer records a diagnostic copy of every database
  reply, which was doubling the work of reading data during a turn.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

Database command monitoring is off in the turn worker by default. It can be
turned back on for diagnosis with an environment setting.
