---
date: 2026-10-26
title: Index funds rebalance with fewer database trips
summary: >-
  The index fund phase reads the bond book, market pools and open bids once
  per turn instead of once per fund. No gameplay change.
tags: [performance, turn, index-funds]
badges: [patch]
areas: [engine]
---

## What changed

- Funds buying bonds plan against one shared read of the bond book and pools
  and publish their new prices in one write.
- Sponsorship fees, rebalancing bids and the equity liquidity facility write
  their records once per turn instead of once per fund.
