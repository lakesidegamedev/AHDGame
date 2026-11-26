---
date: 2026-11-26
title: Turns no longer stop on a very rich regional treasury
summary: >-
  A regional treasury holding tens of trillions in local currency stopped the
  turn during regional debt settlement. Those regions now settle in whole units.
tags: [turns, budget]
badges: [patch]
areas: [backend]
---

Regional debt settlement counts money in cents. A region whose treasury grew past the range where cents stay exact stopped the turn. Settlement now falls back to whole currency units for that region and the turn carries on. Every other region still settles to the cent.
