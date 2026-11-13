---
date: 2026-11-13
title: "A world reset now returns every default party to its starting state"
summary: >-
  Default parties used to survive a reset with whatever the old world had done
  to them, such as a merger, a new tier or custom officer titles. A reset now
  puts each one back to its starting values and removes old party charters.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- After a reset, a default party keeps only its identity: ids, country, creation time and its own Discord link.
- Merged or defunct state, officer titles, tier, earned regions, action points and old turn stamps are cleared or restored to the seed.
- Old party charters are removed.
- The reset's own check now fails if any party is defunct or merged, differs from the seed outside that identity list, or any charter remains.
- The merged-party repair check no longer treats a new world's own regional rows as leftovers, so it cannot delete them.
