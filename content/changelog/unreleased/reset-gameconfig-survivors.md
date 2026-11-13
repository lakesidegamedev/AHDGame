---
date: 2026-11-13
title: "The reset check now covers the game settings"
summary: >-
  A world reset keeps the operator's switches on purpose. Its own check now
  names those survivors explicitly and fails when any other game setting still
  differs from its starting value.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- Operator switches, stages, maintenance and audit settings, Discord links and owner-tuned economy values are listed as survivors, each group with a reason.
- Any other game setting that differs from the seed after a reset fails the reset check.
- A leftover stamp from the retired economy market rollout is now cleared by the reset.
