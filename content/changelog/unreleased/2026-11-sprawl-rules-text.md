---
date: 2026-11-22
title: "Sprawl rules text no longer shows NaN"
summary: >-
  The sprawl explanation on a corporation's Operations tab reads normally when
  the logistics figure is not visible to you.
tags: [corporations, display]
badges: [patch]
areas: [frontend]
---

## What changed

- The sprawl explanation on the Operations tab used to print NaN for the threshold and rate when a corporation's logistics strength was hidden from the viewer. It now states the general rule and only adds that corporation's own threshold and rate when the figure is available.
