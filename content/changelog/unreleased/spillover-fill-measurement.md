---
date: 2026-11-04
title: "Substitution orders no longer make a good look short"
summary: >-
  When households cannot buy their first choice, part of that money goes to
  other goods as substitution orders. Those orders are now counted separately,
  so a cheap good that catches them no longer reads as badly short on country
  market pages. Nothing about trading, prices or money changes.
tags: [economy, producer-market, commodities]
badges: [patch]
areas: [engine]
---

## What changed

- When a household's first-choice good sells out, the market moves 70% of the money it could not spend onto other goods it buys that still have stock (spillover). Those extra orders were counted as ordinary demand, so a cheap good that caught a lot of spilled money looked badly short even though every unit made was sold.
- On the latest turn, households placed 155,128 units of chemicals orders as substitution, out of 176,565 chemicals units ordered in total. Chemicals read as 14% filled. Counting first-choice orders only, every first-choice unit was delivered.
- Each household order now records how much of it came from spillover, and each country's market book records the total. Country market views read demand as first-choice orders only, and show substitution orders on their own line ("plus N substitution orders"). Units bought through substitution still count as received.
- This is measurement only. Deliveries, prices, cash, settlement receipts, the price phase and the shortage signals that drive company growth and restarts are unchanged. Replaying the latest turn with and without this change gives an identical settlement.
