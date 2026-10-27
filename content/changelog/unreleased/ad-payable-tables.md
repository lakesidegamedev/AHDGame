---
date: 2026-10-27
title: Advertising payments settle faster each turn
summary: >-
  Paying advertising sellers for funded product campaigns now moves far less
  data per order, which shortens the corporation part of every turn. The money
  each seller receives is unchanged.
tags: [performance, advertising, turn]
badges: [patch]
areas: [engine]
---

Each funded advertising order keeps its per-seller payment table in its own
record instead of inside the payment journal, so the turn no longer rereads that
table for every step of every order.
