---
date: 2026-10-30
title: Sector table counts plants and shows builds arriving
summary: >-
  The corporation sector table now shows how many plants you own and have
  on order, how fast builds arrive, and how much of your capacity you really use.
tags: [corporations, ui]
badges: [patch]
areas: [frontend]
---

The sector table used to show "Sites 1" next to a capacity figure, which hid
how many plants you actually had. It now shows plants built, with the plants
still under construction beneath, such as "+3 building · done turn 539".
Builds that arrive a slice at a time show how many plants are in and about how
many land each turn, so a build that looks quiet is no longer mistaken for a
stuck one. Capacity stays in units a day, labelled as such.

The old Fill column is now called Sold: the share of the output you offered
that sold. Under it, Used shows how much of your capacity you actually made
last turn, so a sector selling everything it makes at a few percent of its
capacity no longer looks healthy.
