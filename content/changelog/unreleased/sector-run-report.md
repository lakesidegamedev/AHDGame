---
date: 2026-11-05
title: The sector page says why your plants run where they do, and what would run more
summary: >-
  A new report above the run bar names the real reason output is low, shows
  what each unit sold for against what it cost, says what next turn's plan is,
  and lists the fixes that would run the most capacity.
tags: [corporations, interface, production]
badges: [minor]
areas: [frontend]
---

## What changed

- Above the run bar, a short report says how much of your capacity ran, the
  one reason the rest did not, and next turn's plan. A plant stepping back up
  says how many turns until a full run.
- A new line compares what each unit sold for with what it cost in materials,
  wages and site running, so you can see when you are losing money on every
  unit.
- A plant that sells everything but loses money on each unit is now marked
  "Cut back: losing money". It used to say "Ramping up" while its output kept
  falling. This includes sites that send their output to your own other sites.
- "What would run more" lists up to three fixes, largest first, such as adding
  cash, finding a missing input, or the price sitting below your cost.
- The run bar's legend is grouped into what was made, what was planned but
  stopped this turn, and what was not in the plan. "Short of cash" now reads
  "Stopped: not enough cash", and "Held by cash" reads "Kept low after a cash
  cut", so the two no longer sound like the same thing.
