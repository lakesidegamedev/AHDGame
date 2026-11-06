---
date: 2026-11-06
title: Plants expect rivals to match their price when they price above households
summary: >-
  Behind the next step of the household price switch, a plant judging a price
  assumes rivals asking more will come down to it, so a whole market no longer
  prices itself out of what households can pay.
tags: [economy, markets, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- An automatic plant guesses how much it would sell at each price it could
  ask. It assumed every rival kept last turn's price. In a short market those
  prices sat above what households will pay, so each plant thought it alone
  could sell to the companies bidding more, and every plant priced there.
  Households bought none of it and the food went unsold.
- At the next step of the switch, a plant assumes rivals asking more than a
  price would match it. A price only a few companies can pay then looks as
  crowded as it really is, and the plant stays where households can buy.
- Prices set by players are not affected.
