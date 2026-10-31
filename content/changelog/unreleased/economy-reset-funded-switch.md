---
date: 2026-10-27
title: Economy reset switches straight onto the funded market
summary: >-
  The economy-only reset can now rebuild the economy and move it onto the funded producer market in one
  operator command, with an optional economy pause horizon.
tags: [economy, admin]
badges: [patch]
areas: [backend]
---

## What changed

- New operator command runs the economy reset, the producer opening and the funded market switch in order, verifying each step and resuming from the first step that did not land.
- The producer opening apply step is restored; it had been removed as unreferenced.
- The funded switch refuses unless the opening is recorded for the live world at the current turn.
