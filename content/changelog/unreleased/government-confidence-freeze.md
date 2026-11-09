---
date: 2026-11-08
title: "Pause Government Confidence while it is reworked"
summary: >-
  An Admin switch freezes Government Confidence at its current value across countries.
tags: [government, admin]
badges: [patch]
areas: [engine, ui]
---

- Government Confidence defaults to Frozen. The Admin kill-switch board can resume it without a deployment.
- Frozen gauges keep their values and history. Automatic drift, confidence events, formation boosts and post-snap resets pause, along with gauge-triggered dissolution.
- Normal parliamentary no-confidence votes, government formation and public approval continue. Resuming does not replay confidence changes missed while frozen.
- The operator's switch setting survives world resets.
