---
date: 2026-11-05
title: "Index listing petition fee uses the right currency"
summary: >-
  The suggested lobbying fee for an index listing petition is now 2% of market
  value for companies that report in a non-anchor currency.
tags: [index-funds, currency]
badges: [minor]
areas: [backend]
---

## What changed

- A company's market value was read in its home currency as if it were anchor currency, so the suggested lobbying fee and the size check could be far too high for companies such as those reporting in yen.
- Market value is now converted to anchor currency first. Anchor-currency companies are unchanged.
