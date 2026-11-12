---
date: 2026-11-11
title: "One entry per old Chinese law in the running-world price table"
summary: >-
  Internal fix with no change for players: the price table for old laws in
  running worlds listed China's entries twice.
tags: [budget, legislation]
badges: [patch]
areas: [engine]
---

No visible change. Two updates each added China's old laws to the table that
keeps them priced in running worlds. The prices were the same, but the repeat
broke the code checks. Each law is now listed once, and a check stops it
happening again.
