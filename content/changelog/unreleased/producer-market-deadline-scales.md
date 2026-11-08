---
date: 2026-11-08
title: "Market step no longer stops a turn early"
summary: >-
  The market step's time limit now follows the turn's phase limit, so a large
  but normal market is no longer abandoned and the turn can advance.
tags: [economy, turns]
badges: [patch]
areas: [engine]
---

- A fixed three-minute limit on preparing the market stopped a turn that the longer phase limit would have allowed. The limit is now three quarters of the phase limit.
- If the limit is ever reached, the failure message now lists how long each stage took.
