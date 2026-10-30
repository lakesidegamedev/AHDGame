---
date: 2026-10-30
title: Automatic prices stay at the market, and the plant page names the real limit
summary: >-
  A plant on automatic pricing no longer asks far above the market in a short
  market and sells nothing. Your pricing posture now sets its markup over the
  market price. The capacity meter tells short inputs, short cash and weak
  demand apart.
tags: [economy, corporations, pricing]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- Automatic pricing never asks more than the market price plus your posture.
  Before, a plant could copy the highest bid anywhere in the world book, even
  from buyers it could not reach, and sell nothing at that price.
- Your pricing posture (from -20% to +20%) now applies on the funded market as
  a markup over the market price.
- A plant that sells everything it makes no longer shows "Demand limited" just
  because short inputs cut its run. The meter shows "Waiting on inputs",
  "Short of cash" or "Demand limited" for the cause that actually applied.
