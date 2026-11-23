---
date: 2026-11-23
title: Country metrics now follow the laws actually in force
summary: >-
  State and provincial opening laws no longer count as unfunded, so estimated
  metrics stop sliding for no reason. The metrics and Policy pages now show the
  real law levels and the real pressure each law applies.
tags: [metrics, legislation, policy]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- Fixed estimated metrics (air quality, crime, health coverage, social cohesion, public trust and others) drifting down in every state and province. Opening state and provincial laws with no regional budget line were treated as unfunded. Affected metrics now recover gradually toward the level that matches current laws and conditions.
- Law pressure on the metrics page now shows the change from the opening law, which is what moves the metric. Laws that match the opening law now show no pressure, and replacement laws show only their change.
- The Policy page now shows the enacted level of each law. Some laws, such as Ethics and Audit or National Security, previously showed their lowest level.
- Each metric now shows its 0 to 100 score, so domain scores can be checked. Military readiness now counts toward the Security domain.
- Metric history charts now place points by turn and label values, and hovering shows each recorded turn.
- Voter turnout now shows the election it comes from. Treatment delay and housing burden units now use consistent labels.
