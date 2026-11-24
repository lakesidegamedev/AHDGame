---
date: 2026-11-24
title: "Market chart control waits until it can respond"
summary: >-
  The chart button becomes available when the Market finishes reading your
  chart preference, so your first click on the button takes effect.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The chart button holds its space while the page loads and enables once it can respond.
