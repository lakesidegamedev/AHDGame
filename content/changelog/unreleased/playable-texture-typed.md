---
date: 2026-11-11
title: Regional metric texture for 1953 boards is built from typed seed data, with no player-visible change
summary: >-
  The code that derives regional variation for 1953 boards now reads the
  regional seed data with its real types instead of forcing them. The derived
  numbers are unchanged.
tags: [maintenance]
badges: [patch]
areas: [engine]
---

## What changed

- The 1953 regional texture step reads each country's regional metrics, era
  adjustments and preset overlays through their real types, so a change to
  that data shape is caught when the code is checked.
- Every region's derived texture is the same as before.
