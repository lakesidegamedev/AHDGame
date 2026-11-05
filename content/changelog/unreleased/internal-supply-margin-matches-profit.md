---
date: 2026-11-05
title: Internal supply margin now matches the profit shown
summary: >-
  A site that supplies your own other sites no longer shows a positive margin
  beside a loss. Margin and profit are counted from the same lines.
tags: [economy, corporations]
badges: [patch]
areas: [fullstack]
---

## What changed

- A site sending free output to your own sites showed a margin that counted the
  value of those deliveries while its profit did not, so a loss could sit next
  to a positive margin. Both now count the same lines.
- You can still choose in the CEO Office whether internal supply is sold at
  cost or at market price. At cost, the supplier shows revenue equal to its
  cost and the receiving site shows the matching charge; company totals stay
  balanced.
- Existing settings keep working. Booked profit, tax and valuation are unchanged.
