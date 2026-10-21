---
date: 2026-10-21
title: Share buybacks can no longer overdraw a company's treasury
summary: >-
  A company that runs a buyback from escrow could draw the shortfall from its
  own cash even when it had none, pushing its cash negative. A sale the escrow
  and cash together cannot cover is now refused. Switched on separately.
tags: [economy, corporations, stock-market]
badges: [minor]
areas: [engine]
---

## What changed

- A sale into a company's buyback is paid from the buyback escrow first and from the company's cash for the rest.
- If the two together cannot cover the sale, it is refused with the existing treasury message instead of overdrawing the company.
- Companies with enough escrow or cash see no change.
