---
date: 2026-11-02
title: Output sent to your own sites no longer shows as unsold
summary: >-
  A plant whose output went free to your company's other sites showed those
  units as unsold, with a warning that the market was oversupplied. The sector
  page now names them as delivered to your own sites.
tags: [corporations, plants, economy]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- When one of your plants supplies your company's other sites, those units move
  for free: they are not sales, so they earn the supplying plant nothing, but
  the receiving sites do not pay for them. The sector page counted them as
  unsold and told you to cut your price. It now lists them separately, and the
  Unsold figure only counts units nobody took.
- The plant's idle reasons no longer blame weak demand for output that went to
  your own sites.
