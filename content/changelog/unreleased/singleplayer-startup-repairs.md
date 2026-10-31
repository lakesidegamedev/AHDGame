---
date: 2026-11-01
title: Singleplayer worlds get the same startup repairs as the live game
summary: >-
  A local world now receives the game's required data repairs when it opens
  and right after a new game is created, so updating the desktop client no
  longer leaves an existing save on an older data layout.
tags: [singleplayer, migrations, stability]
badges: [patch]
areas: [backend]
---

## What changed

- The game's short list of required startup repairs now runs in singleplayer
  too. It used to run only on hosted servers, so a local save created by an
  older client opened in a newer one without them.
- Creating a new local world applies the same repairs before the first turn.
  A hosted reset is followed by a server restart that does this; a local new
  game keeps the same server running, so new 1991 worlds missed their opening
  bond market pools.
- A local `next dev` pointed at a shared database still skips them.
