---
date: 2026-11-15
title: "A reset world starts on the funded market from its first turn"
summary: >-
  A world reset now switches the economy to the funded market itself, so the
  first turn is a funded turn instead of one turn of the old market.
tags: [economy, corporations, world]
badges: [patch]
areas: [backend, engine]
---

A freshly reset world used to run one turn on the old market before it could
switch to the funded market, and the switch was a separate manual step. If
the step was missed, the world stayed on the old market and its demand that no
one paid for.

The reset now finishes the job. It fills in the two values the switch needs
that only a turn used to produce: plant capacity for public healthcare
providers seeded without it, and local prices for services sold state by
state. Then it opens the funded market. The first turn after a reset is a
funded turn.

If the funded market cannot open, turns stay stopped and the reset record
says why, so a world never runs the old market by accident.
