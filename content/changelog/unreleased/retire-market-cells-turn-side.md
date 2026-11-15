---
date: 2026-11-15
title: Computer-run companies expand into real shortages, not a fixed market size
summary: >-
  Computer-run companies now decide where and how much to build from the unmet
  demand for goods, and the yearly market top-up is gone.
tags: [economy, corporations]
badges: [minor]
areas: [backend]
---

## What changed

- A computer-run company can found a new business in any region of its country.
  How much it builds is limited by its cash and by how much demand for that
  industry's goods is still unmet there, not by a stored market size.
- Capacity already on order, and what another company founds earlier in the
  same turn, counts against the unmet demand, so two companies no longer pile
  into a gap that only fits one plant.
- The yearly boost to unclaimed markets and the daily growth of unclaimed
  markets are removed.
- When a company with no active CEO sheds capacity, that capacity simply stops
  existing. It is no longer handed back to an unclaimed market.
- The background share of a region's economy, used for GDP growth, the economic
  model label, infrastructure and environment scores, is now worked out from the
  region's GDP instead of from stored market sizes. It limits nothing.

## Developer notes

- Candidate markets are every region crossed with every lane. Unmet demand is
  netted against build queues and in-pass claims (`rules/demandClaims`).
- The NPP decision goldens were regenerated: founding is now bounded by unmet
  demand, so fewer foundings are proposed on the same fixture world.
