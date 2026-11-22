---
date: 2026-11-22
title: Price settings no longer drag a market down every turn
summary: >-
  A chosen price setting such as -20% is now measured from a steadier market
  price that moves at most 6% a turn, instead of last turn's sale price. The
  pricing panel shows what each output asked and what buyers paid.
tags: [corporations, economy, pricing, bugfix]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- A price setting below or above the market is measured from a steady market price. It follows real sales but moves at most 6% a turn in either direction, so a glut still lowers prices and a shortage still raises them.
- Before this, a seller at -20% that covered all demand set the market price, and the next turn's -20% was taken from that lower price again. Prices could fall about 20% a turn with no floor.
- Automatic pricing still asks last turn's market price.
- The pricing panel now lists each output's asking price beside the price buyers paid last turn.
