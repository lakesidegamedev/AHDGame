---
date: 2026-11-03
title: AI mines grow on the prices of what they actually dig
summary: >-
  AI oil and gas wells kept adding capacity because coal and rare earth were
  short, while crude oil sat at the price floor. AI mines now decide whether
  to grow, and whether to reopen, from the prices of their own outputs.
tags: [economy, corporations, balance]
badges: [patch]
areas: [engine]
---

## What changed

- AI-run mines used to judge expansion against the whole raw-materials basket
  (iron, coal, oil, rare earth, gas and timber), whatever they produced. A
  shortage of coal or rare earth therefore counted as a reason to build more
  oil and gas wells, even while crude oil was selling at its lowest allowed
  price and unsold stock piled up.
- A mine running a focused method (oil and gas, coal, iron, timber, rare
  earth) now reads only the prices of what that method produces when it
  decides to grow, how much worn capacity to replace, and whether a closed
  mine should reopen. Mines on the standard mixed method, and every other
  industry, are unchanged.
- Mines that players manage by hand are not affected; mines left on autopilot
  follow the same rule. Existing capacity is not removed; it stops growing
  into markets that do not need it.
