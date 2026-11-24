---
date: 2026-11-23
title: Correct financial explanations and preserve numeric input intent
summary: Corporate cash reports use the recorded earnings and currency basis, fiscal projections use booked interest, and invalid quantities are rejected without rewriting orders.
tags: [corporations, budgets, trading, currencies]
badges: [patch]
areas: [fullstack]
---

- Corporate turn reports include bond flows and received dividends once, in the historical reporting currency. Remaining differences are labeled unreconciled rather than proof of missing money.
- Cash reports aggregate the complete matching transaction set and identify missing currency evidence. New post-bond cash snapshots keep a fixed observation boundary across retries; older records identify their timing as estimated.
- Debt projections use the interest already charged to the budget. Countries missing tax bases derive them from their own GDP.
- Share orders, orderbook fills, bulk construction and wires preserve invalid input for correction instead of deleting signs or decimal points or silently reducing a request to its limit.
- Commodity prices and charts show unavailable currency evidence instead of presenting an unconverted amount as local money.

These corrections do not change existing wallet balances or replay financial settlements. Existing cash history does not require a backfill.
