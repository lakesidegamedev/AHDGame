---
date: 2026-11-22
title: Automatic pricing follows the steady market price
summary: >-
  Plants on automatic pricing now ask the steady market price, which moves at
  most 6% a turn, instead of last turn's sale price. Revenue no longer swings
  up and down every other turn from chasing the previous turn's price.
tags: [corporations, economy, pricing, bugfix]
badges: [patch]
areas: [engine]
---

## What changed

- Automatic pricing asks the same steady market price that price settings are measured from. It follows real sales but moves at most 6% a turn.
- Before this, a strong turn raised the next ask, the higher ask sold less, and the weaker turn lowered it again, so some plants saw revenue jump up and down every other turn.
- In a shortage, a plant that sold out still raises its price above the market as before.
