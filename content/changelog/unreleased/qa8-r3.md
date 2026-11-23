---
date: 2026-11-23
title: Clearer offers, estimates, per-share rates, bond limits and price caps
summary: >-
  A private corporation shows book value per share everywhere instead of a
  market quote, the build dialog gives profit and payback for small new
  sectors, and the supply agreement form shows what each side pays or receives.
tags: [corporations, stock-market, supply-agreements, bonds, market]
badges: [patch]
areas: [fullstack]
---

## What changed

- A private corporation no longer shows a share price or a price change on its Overview or in the bottom bar. The Overview says Book value per share, its total is called a valuation, and the bottom bar drops the ticker quote. Portfolio rows for private shares label the figure as a valuation, and the data sent to your browser carries no market price for them.
- The build dialog now shows profit and payback for a small new sector once its market support period is over. Before, a young sector could stay on "results are incomplete" for good. When a forecast is still missing, the message now says why, such as a strategy change in progress.
- The supply agreement form now says what each side pays or receives. As buyer you see the market cost per unit next to the contract cost. As seller you see what a market sale brings next to what the contract pays, which is that sale plus the premium.
- On the Open supply offers board, computer-run offers now carry a note on how their sizes are set, and each card says whether its quantity comes from the seller's total unmet output or from half of its spare capacity for that good.
- When you look at a public corporation you do not run, the financial statements now say at the top that they are an estimate from the last quarterly report, within about 10%, and the statement titles are marked as estimates. This applies to every character on an account except the one running the corporation.
- Per-share payout and buyout rates, such as the amount paid per share when a corporation is dissolved, now show enough digits, for example $0.7005 instead of $1.
- Bond limits are shown in the anchor currency with the converted amount beside them, for example "₳500M, about $449M at today's rate". The converted amount moves with the exchange rate, and the screen says so.
- Goods sitting at the price cap now say what the cap is a multiple of, for example "3x the inflation-adjusted base (base x 1.20 = +260% vs original base)". The "vs base" columns are now labelled "vs original base".
