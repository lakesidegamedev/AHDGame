---
date: 2026-11-13
title: Fix cookie consent hydration warning
summary: Prevents a hydration warning when a returning player's saved cookie choice is applied before the page loads.
tags: [privacy, cookies]
badges: [patch]
areas: [frontend]
---

- Keeps saved cookie choices from triggering a hydration warning while preserving
  the banner's first-paint behavior.
