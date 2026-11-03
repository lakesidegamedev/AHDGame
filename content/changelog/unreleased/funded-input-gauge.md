---
date: 2026-11-03
title: Sector input gauge now shows what actually held your plant back
summary: >-
  The input availability figure on sector pages came from an old market model
  and sat at 85% for most plants, often blaming freight even when the
  company's own logistics site delivered every unit the plant needed.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Each turn the sector input gauge was still filled in by the market model
  used before the producer market, which never saw producer market fills or
  deliveries from your own sites. Most plants showed 85%, its lowest setting,
  with an input such as freight named as the bottleneck while the plant ran
  at full rate.
- The gauge now comes from the producer market settlement: 100% when every
  input arrived, otherwise the share of the run the plant could make and the
  input that ran short. AI companies read the same figure when deciding to
  sign supply deals, so they no longer chase shortages that are not there.
- Own-site supply itself was already working: a company's logistics site
  fills its own plants' freight orders first. Those deliveries are internal
  transfers, so they count as delivered rather than sold, and by default they
  carry no price. A logistics site feeding its sister plants therefore shows
  low sales and a site loss while the company as a whole does not pay for
  that freight.
