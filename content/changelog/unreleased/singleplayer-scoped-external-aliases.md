---
date: 2026-11-01
title: The desktop singleplayer game starts again on current builds
summary: >-
  Packaging now keeps every library the local game server loads, so a desktop
  build of the current game no longer fails on every page at startup.
tags: [singleplayer, packaging, desktop]
badges: [patch]
areas: [backend]
---

## What changed

- The singleplayer package recreates the hashed library names the game server
  loads. It only recognised plain names such as the database driver, so the
  error reporting library added this autumn and the file storage client were
  left out. Desktop installers drop the shortcut that hid this in local test
  runs, and a packaged build of the current game failed every request.
- Packaging now handles scoped names and requests for a file inside a library,
  and its check fails the build if any of them is missing.
