---
date: 2026-11-05
title: Reconcile financial and economy displays
summary: >-
  Financial reports, portfolios and economy pages now use consistent units,
  holdings and published unemployment values.
tags: [economy, corporations, portfolios, metrics]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- Show debt-to-GDP ratios as percentages and convert quarterly report rates to the selected financial period.
- Include investment dividends in reported earnings and gross bond interest in cost charts.
- Count unsold corporate share reservations and use the held company's explicit currency in balance-sheet valuations.
- Include index funds and unpaid income tax consistently in personal portfolio totals. Keep the loan deduction when the separate loan-controls request is unavailable.
- Include corporate index funds in the portfolio, its breakdown and future snapshots. New snapshots also retain unsold share ownership and all outstanding issued bond liabilities.
- Use the same own-site supply valuation for sector list and detail margins, with the non-cash amount explained separately.
- Read national unemployment from the current published metric rollup when v2 metrics are enabled, across all countries. Missing or stale v2 data is shown as unavailable.

## Compatibility

The optional corporate history `fundValue` field is written only to new snapshots.
Existing snapshots are preserved without fabricated fund history. The existing
world-reset policy wipes the entire portfolio history collection, so no new
collection, index or backfill is required. These changes do not alter settlement,
payouts, taxation or economic balance.
