---
date: 2026-11-10
title: Wartime seizure rules groundwork, with no player-visible change
summary: >-
  The rules for taking an enemy company during a war now exist as a portable
  module. No order can be placed yet, so nothing in a running game changes.
tags: [nationalization, diplomacy, war]
badges: [patch]
areas: [engine]
---

## What changed

- The wartime seizure rules now live in a pure module that takes plain data in
  and returns plain data out, so the same code can run in a request path, a turn
  phase, or the headless harness.
- The module encodes the refusal order for a taking, the per-asset tension and
  the domestic political factor, and it carries a recorded valuation for a peace
  settlement without deciding who funds or receives it.
- Groundwork only. There is no route, no order storage and no turn work, so no
  player can place an order and no in-game number moved. Notes in this directory
  are not published as written: they fold into the dev post for a release, and
  the public post is written by hand.
