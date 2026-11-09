---
date: 2026-11-07
title: Free transfer pricing no longer shows internal supply charges
summary: >-
  A company on Free transfer pricing books nothing between its own sites, so
  site pages stop showing internal supply charges and own-site transfer income.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Sites of a company on Free transfer pricing showed an "Internal supply
  charges" line and "Own-site transfer income", valued at market prices, even
  though Free is meant to book nothing. The charge made some sites look like
  they were losing money when they were not.
- Free now books no entries between a company's own sites. Cost and Market
  pricing are unchanged.
- No cash moved before and none moves now; only the site accounts change.
