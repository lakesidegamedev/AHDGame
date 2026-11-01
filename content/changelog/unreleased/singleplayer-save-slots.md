---
date: 2026-11-01
title: Singleplayer worlds get save slots and autosaves
summary: >-
  Save a singleplayer world under a name, go back to any save, and let the game
  keep the last three autosaves so a bad turn can be rolled back.
tags: [singleplayer, saves, desktop]
badges: [minor]
areas: [fullstack]
---

## What changed

- You can save a singleplayer world at any time and give the save a name. Saves
  live inside the world's own folder, so deleting a world deletes its saves.
- The game autosaves after every turn by default and keeps the last three. You
  can ask for an autosave after every 2nd, 5th or 10th turn instead, or turn
  autosave off.
- Loading a save takes the world back to that turn. Your world as it stood just
  before the load is kept as one extra save, so a load can be undone.
- A save is checked end to end before anything is replaced. If a save is damaged,
  your world stays as it was and you are told why.
- Older saves open on newer versions of the game the same way an older world
  does: they are brought up to date as they load.
- Worlds that other players have joined go back too: players who joined after a
  save was made need to sign up again after it is loaded.
