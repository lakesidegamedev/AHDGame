---
date: 2026-11-12
title: "A world reset now needs a passing rehearsal first"
summary: >-
  The reset command refuses to wipe a real world unless a recent passing
  rehearsal of the same settings and the same code is on record.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The rehearsal record now stores the reset settings, the code version and whether it passed.
- Resetting a world that is not a rehearsal database requires a passing record under 24 hours old, for the same settings and the same code.
- An explicit skip with a written reason exists for emergencies; it prints a loud warning.
