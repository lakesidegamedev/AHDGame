---
date: 2026-11-23
title: "Share prices, cash and freight figures agree across screens"
summary: >-
  Private corporations stop showing a market price, the bottom bar matches the
  corporation page, and freight, build progress and sold-share labels say what
  they measure.
tags: [corporations, stock-market, finances]
badges: [patch]
areas: [frontend]
---

## What changed

- A private corporation no longer shows a share price, a price change, a bid depth or an exchange name. The header says it is private and shows its book value per share instead, and its estimated total value is labelled as a valuation.
- The share price change in the bottom bar is now worked out against the same previous turn the corporation page uses, so the price and its change always describe the same move and no longer freeze on an old figure.
- The cash on the Shares tab is labelled Personal cash and shows the same amount as the bottom bar, instead of passing a home currency balance through the wrong conversion.
- The state freight line on a sector page says it is the whole state's load across all companies, not this sector's own use, and names the unit (TEU per day).
- The CEO Office free transfer note and the sector inputs note say that goods from your own sites are transfers inside the company, with no cash moving, and that any market value shown for them is an estimate.
- The build progress bar says it shows how much of the ordered capacity has arrived. A site only counts as finished when it is complete, and the bar is not the share paid.
- The Overview "Output sold" figure now uses the same settled sold share as the sector list and sector pages, weighted by what each sector offered.
