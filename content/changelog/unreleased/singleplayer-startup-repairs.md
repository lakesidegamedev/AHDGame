---
date: 2026-11-01
title: Singleplayer saves keep working after a game update
summary: >-
  A local world now receives every data update the live game has had since
  the world was created, when it opens and right after a new game is created,
  so updating the desktop client no longer leaves an existing save on an older
  data layout.
tags: [singleplayer, migrations, stability]
badges: [patch]
areas: [backend]
---

## What changed

- Opening a local world now applies the game's data updates that are newer
  than the build that created it, before the world is shown. Singleplayer used
  to receive none of them, so a save from an older client hit errors in a newer
  one; a 1991 save from September failed the population movement step every
  turn because its county populations were never set up.
- Creating a new local world applies the required repairs before the first
  turn and records the world as current with the build that made it. New 1991
  worlds used to miss their opening bond market pools.
- If one update cannot apply, the world still opens and the update is tried
  again next time.
