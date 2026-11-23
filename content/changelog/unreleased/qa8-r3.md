---
date: 2026-11-23
title: Private shares, build forecasts and contract prices read clearly
summary: >-
  A private corporation shows book value per share everywhere instead of a
  market quote, the build dialog gives profit and payback for small new
  sectors, and the supply agreement form shows what each side pays or receives.
tags: [corporations, stock-market, supply-agreements]
badges: [patch]
areas: [fullstack]
---

## What changed

- A private corporation no longer shows a share price or a price change on its Overview or in the bottom bar. The Overview says Book value per share, its total is called a valuation, and the bottom bar drops the ticker quote. Portfolio rows for private shares label the figure as a valuation, and the data sent to your browser carries no market price for them.
- The build dialog now shows profit and payback for a small new sector once its market support period is over. Before, a young sector could stay on "results are incomplete" for good. When a forecast is still missing, the message now says why, such as a strategy change in progress.
- The supply agreement form now says what each side pays or receives. As buyer you see the market cost per unit next to the contract cost. As seller you see what a market sale brings next to what the contract pays, which is that sale plus the premium.
