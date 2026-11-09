---
date: 2026-11-09
title: Background countries now post briefs, and restructure when their debt spirals
summary: >-
  Each of the 16 background countries now posts a short brief to the wire and its
  country page when something changes: a credit downgrade or debt stress, an
  election, a big currency move, an austerity package or a debt restructuring.
  Every brief links straight to buying its bonds, its national index fund and
  trading its currency. The country page also shows its public finances.
tags: [world, economy, bonds, wire]
badges: [minor]
areas: [frontend, backend]
---

## What changed

- A background country posts a brief when its credit rating changes, its debt
  interest spiral worsens, it holds an election, announces an austerity package,
  its currency moves 8% or more over a day, or restructures its debt. A quiet
  country still posts an outlook roughly every four days, staggered so they do
  not land together.
- Each brief goes to the wire ticker, the news feed and the country page, with
  buttons for its bonds, its national index fund, its currency market and world
  trade. The first look after the update records the current state without
  posting, so there is no backlog.
- The background country page gains a Public finances panel: the interest spiral
  count against the two years that trigger a restructuring, how much programme
  spending is left after cuts, tax rises so far and the latest austerity package.
- Fix: the interest spiral restructuring never fired for background countries
  because it read a counter that nothing wrote for them. It now restructures
  through the same default path as other countries after two spiral years, so
  their bondholders take the haircut the page warns about.
