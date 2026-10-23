---
date: 2026-10-20
title: Banking hub loads faster
summary: The banking hub no longer looks up each private bank's central bank one at a time.
badges: [patch]
areas: [backend]
tags: [banking, performance]
---

The banking hub reads central bank rates and reserve requirements once per page load instead of once per private bank. Rates, reserve requirements and lending headroom shown on the hub are unchanged.
