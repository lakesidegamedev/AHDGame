---
date: 2026-11-07
title: Free internal transfers no longer book a market value
summary: >-
  Companies whose internal transfer mode is Free no longer show internal supply
  income or charges for deliveries between their own sites.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- A company set to Free internal transfers moves goods between its own sites at
  no value. Previously those deliveries were still valued at the market price
  and shown as internal supply income and charge on the plant profit and loss.
- Companies with a priced mode (cost, market) are unchanged. Company cash and
  total profit are unchanged either way.
