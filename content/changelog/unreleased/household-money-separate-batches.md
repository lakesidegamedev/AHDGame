---
date: 2026-11-26
title: "Turns no longer stop when two kinds of new household money are paid together"
summary: >-
  A turn stopped when households received both growth income and the
  spending power top-up in the same turn. Each is now paid in its own batch.
tags: [economy]
badges: [patch]
areas: [engine]
---

New household money comes in two kinds: income sized by real GDP growth, and
the top-up toward population times wages. The turn paid both in one batch,
but a batch holds only one kind, so the corporation phase stopped. Each kind
is now paid in its own batch, and the turn's check that what was paid matches
what was planned covers both.
