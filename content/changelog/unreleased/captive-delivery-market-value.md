---
date: 2026-11-05
title: Sites that supply their own company now show what that output is worth
summary: >-
  A site that sends its output to its own company's other sites can now be
  credited at the market price for it, so its accounts stop showing a loss for
  goods the company would otherwise have bought.
tags: [economy, corporations, production]
badges: [patch]
areas: [backend]
---

## What changed

- A site that delivered its output to its own company's sites booked no income
  for it unless those sites had run short. A mine feeding its own steel plant
  could show a large loss every turn while the company would otherwise have
  paid the market for the same ore.
- When this is switched on, every delivery between a company's own sites is
  valued at that turn's market clearing price for the good, or at the selling
  site's asking price if the good did not trade that turn.
- The selling site's accounts show that amount as income from its own sites and
  the receiving site shows the same amount as a cost, so the company's totals,
  cash and profit do not change. No money moves.
- Companies that already set their own internal transfer price keep it.
