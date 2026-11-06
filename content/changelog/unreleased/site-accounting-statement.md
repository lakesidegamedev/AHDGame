---
date: 2026-11-06
title: "Sector revenue, profit and margins use the same site accounts"
summary: >-
  Sector rows, expanded accounts and sector pages now use the same settled
  revenue, costs and profit, including priced deliveries to your other sites.
  Free-delivery estimates stay separate from actual earnings.
tags: [corporations, economy, internal-supply]
badges: [patch]
areas: [fullstack]
---

## What changed

- Internal deliveries priced at cost or market price count as income for the supplying site and a matching charge for the receiving site across the company table, sector header and money and margin panels.
- Revenue and profit sorting follow the figures shown in the rows. Totals remove transfers between the company's own sites, so those transfers do not inflate company earnings.
- Estimated value of free deliveries no longer changes net margin. A site with no revenue shows no percentage; its actual profit or loss remains visible.
- Saved funded site accounts carry their settled turn. Detailed costs are joined only to a matching turn, so a new delivery receipt cannot be mixed with older accounts.
- Stock at cost and transition support appear as separate credits. Transfer pricing preferences, production allocation, company cash, tax and valuation rules are unchanged.
