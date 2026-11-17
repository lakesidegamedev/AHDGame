---
date: 2026-11-17
title: "World page loads government data in one read"
summary: >-
  The World page now reads every parliamentary country's government in one
  pass instead of one country at a time.
tags: [performance]
badges: [patch]
areas: [backend]
---

## What changed

- The World page reads government formations for all parliamentary countries at once, so it does less work per visit. What the page shows is unchanged.
