---
date: 2026-11-25
title: "One world supply figure on every market screen"
summary: >-
  The commodity page showed two different world supply figures. Every market
  screen now shows the full traded supply, split into player and AI companies
  and the background economy, adding up exactly.
tags: [market, interface]
badges: [patch]
areas: [frontend]
---

The commodity page showed two world supply figures that differed by what the
background economy sold: the full traded supply in the header and the supply
bar, and a smaller figure in the world totals strip and the supply chart.

Now every market screen, the market list and the public API show one world
supply and demand: what was traded on the market, per turn on the screens.

- **Rows that add up.** Supply is split into player and AI companies, the
  background economy (countries without companies) and the background economy
  (sellers). The supply and demand panel, the country card and the header show
  whole numbers, rounded so each set of rows adds up exactly to its total.
- **World totals strip and chart.** "Could sell", "orders above supply" and the
  supply line on the chart use the same world supply.
- **Your market share.** A company's share of world supply uses the same total.
- **Company lists.** Top producers and top consumers appear once the page has
  loaded the settled figures, instead of showing estimates first.
- **Price note.** The price breakdown says when the price reads supply without
  what the background economy sold.

Nothing about trading or prices changed.
