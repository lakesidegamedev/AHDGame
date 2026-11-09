---
date: 2026-11-05
title: "Product development no longer takes the whole R&D budget"
summary: >-
  A product in development now takes at most half of the R&D budget each turn,
  so research always keeps growing, and earlier product projects are easy to find.
tags: [economy, corporations, research]
badges: [patch]
areas: [fullstack]
---

## What changed

- A product line or media title in development now takes at most half of your R&D budget each turn. The rest always goes to research, so your R&D score keeps growing while the product is paid for. Before, a large project could take the whole budget for days and research showed +0 at any budget.
- Development still gets everything it is owed, just spread over more turns. Nothing is lost: what development does not take goes to research.
- Earlier product projects, started before the product studio, now show at the top of the studio on the Sectors tab, with how much of their cost is paid, a note that they use part of the R&D budget, and the Retire button.
- The R&D line in the CEO Office budget and the Tech tab now name the project in development and the share of the budget it takes.
- Product studio projects are not affected. They are paid from cash, not from the R&D budget.

## Developer notes

- `allocateProductDevelopmentBudget` (`src/lib/products/rules/productBudgets.ts`) caps development at `PRODUCT_DEVELOPMENT_MAX_RD_SHARE` (0.5) of the per-turn budget; generic research receives the remainder, so the two parts still sum to the budget. The turn (`sectorCalculations.ts`), `genericResearchDailyAnchor` and the new `productDevelopmentDailyAnchor` (`strengthProjection.ts`) all go through it, so the budget panel, Tech tab and income statement projection match the turn.
- Payment receipts, the per-turn paid markers and the cash cap on development spend are unchanged.
- `GET /api/corporation/[id]/tech` returns `rdFundedProduct.sharePct` and now reports the funded product whenever development takes a share, not only when research is zero.
