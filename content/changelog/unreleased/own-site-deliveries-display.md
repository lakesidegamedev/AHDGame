---
date: 2026-10-31
title: Output sent to your own sites no longer looks unsold
summary: >-
  A plant that supplies your company's other sites now says so on the sector
  row and the sector page, instead of showing 0% sold and no revenue as if it
  were broken.
tags: [corporations, sectors, ui]
badges: [patch]
areas: [frontend]
---

When a plant hands its output to your own other sectors, no sale happens, so the
sector showed "Sold 0%", no revenue and a loss. The row now adds a line such as
"100% to your sites", and the sector page shows how many units your company used
and what they are worth at your asking price. Revenue is unchanged: nothing is
paid for goods that stay inside the company.
