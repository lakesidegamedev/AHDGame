---
date: 2026-10-31
title: One missed metrics refresh no longer stops the economy
summary: >-
  When a country's metrics refresh misses a turn, approval now reads that
  country's last refresh instead of stopping companies, votes and share prices
  for the turn. No gameplay change on a normal turn.
tags: [turns, approval, metrics]
badges: [patch]
areas: [engine]
---

On turn 561 one missed refresh left every metrics board a turn behind, and each
part of the turn that reads approval refused to run, including the company
turn. Approval now reads a board up to six turns behind, as long as the whole
country is behind together. A board from the future, or a country caught
halfway through a refresh, still fails.
