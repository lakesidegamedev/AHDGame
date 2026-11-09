---
date: 2026-11-05
title: Prices can climb again when buyers go short
summary: >-
  Behind a new switch, off until it is turned on, a company that sold out in a
  market where buyers went short asks a little more next turn, so a shortage
  lifts the price instead of leaving it stuck below what goods cost to make.
tags: [economy, market, production]
badges: [patch]
areas: [engine]
---

## What changed

- Automatic prices follow what traded last turn, and nothing could raise them.
  One cheap seller pulled the average down and every automatic seller followed,
  even in markets where buyers could not get what they ordered.
- Behind a new switch, off until it is turned on, a company that sold all it
  offered in a market where buyers asked for more than they got now asks a step
  above last turn's price. The step grows with how short the market was, is at
  most 5% a turn by default, and never passes the market's price ceiling.
- A market that clears in full keeps its price. A company with goods left over
  gets no raise, and unsold stock still marks down as before.
