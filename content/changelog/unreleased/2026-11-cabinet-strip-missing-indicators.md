---
date: 2026-11-23
title: "Cabinet office shows a dash for indicators with no data"
summary: >-
  Cabinet office stat strips no longer show 0.0 for national indicators the
  country has no stored value for. They show a dash instead.
tags: [cabinet]
badges: [patch]
areas: [fullstack]
---

## What changed

- An indicator with no recorded value now reads as a dash on the cabinet office stat strip, instead of 0.0 (which also showed as a good result for lower-is-better indicators such as corruption).
- Indicators with a real stored value, including a genuine zero, are unchanged.
