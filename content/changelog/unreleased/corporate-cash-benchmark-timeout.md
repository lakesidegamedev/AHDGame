---
date: 2026-10-31
title: Stabilize corporate settlement verification
summary: >-
  The large synthetic corporate settlement comparison has a dedicated test
  timeout, retaining its database command and data-size checks.
tags: [tests, corporations, performance]
badges: [patch]
areas: [engine]
---

The 480-corporation comparison allows slower CI runners to finish its legacy
baseline. Its command-count and projected BSON limits are unchanged.
