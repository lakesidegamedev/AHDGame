---
date: 2026-11-01
title: Singleplayer worlds open again after the first time
summary: >-
  A local world could only be opened once with desktop 2.8.0. Every later
  start failed while loading. Worlds now open every time.
tags: [singleplayer, launcher, stability, hotfix]
badges: [hotfix]
areas: [backend]
---

## What changed

- The desktop app gives the local database a new port each time a world
  starts, but the database remembered the port it first ran on and refused to
  start anywhere else. The game now moves its single local database to the new
  port when it opens a world.
- The automated singleplayer check now reopens its test world on a new port,
  the way the desktop app does, so this cannot return unnoticed.
