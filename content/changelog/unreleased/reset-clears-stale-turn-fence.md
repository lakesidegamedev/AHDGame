---
date: 2026-11-15
title: "A reset clears a stuck turn marker from the old world"
summary: >-
  A turn that failed just before a reset could leave a turn-in-progress marker
  behind, which blocked the funded market from opening in the new world.
tags: [world, turns]
badges: [patch]
areas: [backend, engine]
---

When a turn failed shortly before a world reset, the marker saying which turn
was in progress survived the reset. The new world then looked busy with a turn
it would never reach, which stopped the funded market from opening.

A reset now clears that marker when no turn is actually running, and the
post-reset check treats a leftover marker as old-world state, so the world stays
paused until it is gone.
