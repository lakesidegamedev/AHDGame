---
date: 2026-11-06
title: Fallback site margin rows say they count outside sales only
summary: >-
  Where a site page falls back to the older margin breakdown, the margin line is
  now labelled as outside sales only, so it is not read as the site's full result.
tags: [corporations, ui]
badges: [patch]
areas: [frontend]
---

## What changed

- The "effective margin" line in the older site margin breakdown now reads
  "effective margin (outside sales only)". It never counted goods a site sends to
  its own company's other sites.
