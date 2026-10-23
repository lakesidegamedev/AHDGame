---
date: 2026-10-23
title: Private companies no longer take order book trades
summary: >-
  A private company's CEO could leave a limit bid that no other holder could
  see, and the private sale band could not match its price anyway. Private
  companies now trade through private sale only, and the server refuses order
  book orders for them.
tags: [corporations, shares]
badges: [patch]
areas: [fullstack]
---

## What changed

- Placing a limit order on a private company is refused with a message pointing to private sale.
- The trade dialog drops Limit Order and Orderbook for private companies, leaving At Market and Private Deal.
- Existing open orders stay visible to every holder, so nobody is left with a resting bid only its owner can see.
