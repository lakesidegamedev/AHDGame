---
date: 2026-11-10
title: "Bank stress fades, and banking panics keep their old strength"
summary: >-
  Leftover bank stress now halves for every turn nobody pushes it, and the
  banking panic crisis keeps panicking banks for as long as it lasts, as before.
tags: [crises, banking]
badges: [patch]
areas: [engine, backend]
---

Small pushes on bank stress from stance choices build up, but the stored amount
now fades by half each turn without a new push, so old leftovers cannot tip a
bank into panic years later. The banking panic crisis itself is not slowed down
by the build-up: it keeps banks panicked while it runs, exactly as before.
