---
date: 2026-11-09
title: "Selling a national index fund at a moving price"
summary: >-
  Selling units of a background country's national index fund while it is being
  repriced is now refused with a request to try again, the same as buying.
tags: [world, funds]
badges: [patch]
areas: [backend]
---

## What changed

- If a national index fund reprices while your sale is in progress, the sale is cancelled cleanly and you are asked to try again, so you are never paid at a stale price.
- Internal fix: the repricing step now confirms its own update landed, so a fund can no longer be skipped or counted twice.
