---
date: 2026-11-23
title: "Market and commodity pages keep one currency and explain their numbers"
summary: >-
  Commodity prices no longer flip between currencies, the price chart's base
  line matches the base price in the header, and a few market labels now say
  what they mean.
tags: [markets, commodities]
badges: [patch]
areas: [fullstack]
---

## What changed

- Prices on the market pages no longer switch to the anchor symbol when a background exchange rate refresh fails. They keep the last good rates, and the commodities list says which currency its prices are in.
- The commodity price chart now uses the same currency as the price and base price in the page header, so its base line sits at the base price shown.
- Goods priced at the market's price ceiling are marked "at price cap", which is why several goods show the same change against base.
- The consumers list adds an "Other buyers" row so the listed buyers add up to the recorded demand, and says when company figures are estimates.
- The stock exchange chart note counts intraday turns out of the turns in the chosen range.
- Company growth in the stock list uses the sector's current growth, and is hidden when it is zero instead of showing +0.0%.
